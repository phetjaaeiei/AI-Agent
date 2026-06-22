import { randomUUID } from "node:crypto";
import type {
  GitOperationRecord,
  LocalCiCommandResult,
  LocalCiRun,
  ReviewDecisionRequest,
  ReviewPacket,
  ReviewPacketCreateRequest,
  ReviewPacketStatus,
  ReviewRequirement,
  ReviewerRecord,
  RoleId,
  ToolCallRecord
} from "../../../packages/shared/src/index.js";
import { DEFAULT_LOCAL_CI_COMMANDS } from "../../../packages/shared/src/index.js";
import {
  createRuntimeArtifactRecord,
  createRuntimeAuditEvent,
  createRuntimeMissionState,
  createRuntimeSessionSnapshot
} from "../../../packages/workflow/src/index.js";
import type { RuntimeActivityEvent, RuntimeArtifactContent, RuntimeArtifactSection } from "../../../packages/workflow/src/index.js";
import type { ArtifactContentStore } from "./artifact-content-store.js";
import type { GitOperationStore } from "./git-operation-store.js";
import type { MissionStore } from "./mission-store.js";
import type { ReviewPacketStore } from "./review-packet-store.js";
import type { ToolCallService } from "./tool-call-service.js";
import type { ToolCallStore } from "./tool-call-store.js";

type ReviewPacketServiceOptions = {
  packetStore: ReviewPacketStore;
  missionStore: MissionStore;
  artifactStore: ArtifactContentStore;
  toolCallStore: ToolCallStore;
  gitOperationStore: GitOperationStore;
  toolCallService: ToolCallService;
  now?: () => string;
};

const REQUIRED_REVIEWERS: readonly RoleId[] = ["tech_lead", "qa_lead", "lead_ba"];

export class ReviewPacketService {
  private readonly now: () => string;

  constructor(private readonly options: ReviewPacketServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  listPackets(missionId?: string): Promise<ReviewPacket[]> {
    return this.options.packetStore.listPackets(missionId);
  }

  getPacket(packetId: string): Promise<ReviewPacket | undefined> {
    return this.options.packetStore.findPacket(packetId);
  }

  async createPacket(input: ReviewPacketCreateRequest): Promise<ReviewPacket> {
    const createdAt = this.now();
    const base: ReviewPacket = {
      schemaVersion: 1,
      id: `review-packet-${randomUUID()}`,
      missionId: input.missionId,
      taskId: input.taskId,
      createdByRoleId: input.roleId,
      status: "draft",
      summary: "Review packet is collecting local implementation, test, and Git evidence.",
      evidence: { artifactRecordIds: [], artifactContentIds: [], toolCallIds: [], gitOperationIds: [] },
      requirements: [],
      requiredReviewerRoleIds: REQUIRED_REVIEWERS,
      reviews: [],
      risks: [],
      createdAt,
      updatedAt: createdAt
    };
    const packet = await this.assess(base);
    await this.options.packetStore.upsertPacket(packet);
    await this.persistPacketAudit(packet, "review_packet_created");
    return packet;
  }

  async refreshPacket(packetId: string): Promise<ReviewPacket> {
    const packet = await this.requirePacket(packetId);
    const assessed = await this.assess(packet);
    await this.options.packetStore.upsertPacket(assessed);
    await this.persistPacketAudit(assessed, "review_packet_updated");
    return assessed;
  }

  async recordDecision(packetId: string, input: ReviewDecisionRequest): Promise<ReviewPacket> {
    const packet = await this.requirePacket(packetId);
    if (!packet.requiredReviewerRoleIds.includes(input.reviewerRoleId)) {
      throw new Error(`${input.reviewerRoleId} is not a required reviewer for this packet.`);
    }
    const review: ReviewerRecord = {
      reviewerRoleId: input.reviewerRoleId,
      decision: input.decision,
      summary: input.summary.trim() || `${input.reviewerRoleId} recorded ${input.decision}.`,
      reviewedAt: this.now()
    };
    const next = await this.assess({
      ...packet,
      reviews: [review, ...packet.reviews.filter((item) => item.reviewerRoleId !== review.reviewerRoleId)],
      updatedAt: review.reviewedAt
    });
    await this.options.packetStore.upsertPacket(next);
    await this.persistPacketAudit(next, "review_packet_updated");
    return next;
  }

  async runLocalCi(packetId: string): Promise<ReviewPacket> {
    const packet = await this.requirePacket(packetId);
    const startedAt = this.now();
    const results: LocalCiCommandResult[] = [];

    for (const command of DEFAULT_LOCAL_CI_COMMANDS) {
      const call = await this.options.toolCallService.executeToolCall({
        missionId: packet.missionId,
        taskId: packet.taskId,
        roleId: "automation_qa",
        kind: "test_command",
        command
      });
      results.push({
        command,
        toolCallId: call.id,
        status: call.status === "completed" ? "passed" : call.status === "blocked" ? "blocked" : "failed",
        ...(typeof call.result?.exitCode === "number" ? { exitCode: call.result.exitCode } : {}),
        summary: call.result?.summary ?? call.errorSummary ?? call.policy.reason
      });
    }

    const ciRun: LocalCiRun = {
      profileId: "default_local",
      status: results.some((item) => item.status === "blocked")
        ? "blocked"
        : results.every((item) => item.status === "passed")
          ? "passed"
          : "failed",
      commands: results,
      startedAt,
      completedAt: this.now()
    };
    const assessed = await this.assess({ ...packet, ciRun, updatedAt: ciRun.completedAt });
    await this.options.packetStore.upsertPacket(assessed);
    await this.persistPacketAudit(assessed, "review_packet_updated");
    return assessed;
  }

  async createDeliveryPacket(packetId: string): Promise<ReviewPacket> {
    const assessed = await this.assess(await this.requirePacket(packetId));
    const createdAt = this.now();
    const current = await this.options.missionStore.readSession();
    const artifactRecord = createRuntimeArtifactRecord({
      artifactId: `art-delivery-${assessed.id}`,
      taskId: assessed.taskId,
      title: "Delivery Report",
      summary: assessed.status === "ready" ? "Local evidence is ready for human delivery." : "Draft delivery report includes unresolved evidence gaps.",
      ownerRoleId: "technical_writer",
      gateId: "final_report_gate",
      status: assessed.status === "ready" ? "verified" : "reviewing",
      version: 1,
      createdAt
    });
    const sections = deliverySections(assessed);
    const artifact: RuntimeArtifactContent = {
      schemaVersion: 1,
      id: `artifact-content-${artifactRecord.artifactId}`,
      artifactRecordId: artifactRecord.id,
      artifactId: artifactRecord.artifactId,
      taskId: assessed.taskId,
      missionId: assessed.missionId,
      title: artifactRecord.title,
      summary: artifactRecord.summary,
      ownerRoleId: artifactRecord.ownerRoleId,
      gateId: artifactRecord.gateId,
      status: artifactRecord.status,
      version: artifactRecord.version,
      format: "markdown",
      source: "review_service",
      sections,
      markdown: formatMarkdown(artifactRecord.title, sections),
      createdAt,
      updatedAt: createdAt
    };
    await this.options.artifactStore.appendArtifact(artifact);
    await this.options.missionStore.writeSession(createRuntimeSessionSnapshot({
      ...current,
      missionState: createRuntimeMissionState({
        commandDraft: current.commandDraft,
        missionPlan: current.missionPlan,
        savedAt: createdAt,
        previousState: current.missionState,
        source: "review_service",
        status: assessed.status === "ready" ? "delivered" : "blocked",
        statusReason: artifactRecord.summary
      }),
      selection: {
        ...current.selection,
        selectedRoleId: "technical_writer",
        selectedRoomId: "operations",
        selectedGateId: "final_report_gate",
        selectedArtifactId: artifactRecord.artifactId
      },
      artifactRecords: [artifactRecord, ...current.artifactRecords].slice(0, 100),
      auditEvents: [createRuntimeAuditEvent({
        id: `audit-delivery-${assessed.id}`,
        actorRoleId: "technical_writer",
        action: "delivery_packet_created",
        summary: artifactRecord.summary,
        severity: assessed.status === "ready" ? "success" : "warning",
        entityId: assessed.id,
        createdAt
      }), ...current.auditEvents].slice(0, 200),
      savedAt: createdAt
    }));
    const delivered: ReviewPacket = {
      ...assessed,
      status: assessed.status === "ready" ? "delivered" : assessed.status,
      deliveryArtifactRecordId: artifactRecord.id,
      deliveryArtifactContentId: artifact.id,
      updatedAt: createdAt
    };
    await this.options.packetStore.upsertPacket(delivered);
    return delivered;
  }

  private async assess(packet: ReviewPacket): Promise<ReviewPacket> {
    const [session, artifacts, toolCalls, gitOperations] = await Promise.all([
      this.options.missionStore.readSession(),
      this.options.artifactStore.readArtifacts(),
      this.options.toolCallStore.listToolCalls(packet.missionId),
      this.options.gitOperationStore.listOperations(packet.missionId)
    ]);
    const requirements = assessRequirements(toolCalls, gitOperations, packet.requiredReviewerRoleIds, packet.reviews, packet.ciRun);
    const status = packetStatus(requirements, packet.reviews, packet.status === "delivered");
    const risks = collectRisks(toolCalls, gitOperations, session.missionPlan.risks.map((risk) => risk.label));
    return {
      ...packet,
      status,
      summary: summaryForStatus(status, requirements),
      evidence: {
        artifactRecordIds: unique(session.artifactRecords.map((item) => item.id)),
        artifactContentIds: unique(artifacts.filter((item) => item.missionId === packet.missionId).map((item) => item.id)),
        toolCallIds: unique(toolCalls.map((item) => item.id)),
        gitOperationIds: unique(gitOperations.map((item) => item.id))
      },
      requirements,
      risks,
      updatedAt: this.now()
    };
  }

  private async requirePacket(packetId: string): Promise<ReviewPacket> {
    const packet = await this.options.packetStore.findPacket(packetId);
    if (!packet) throw new Error("Review packet not found.");
    return packet;
  }

  private async persistPacketAudit(packet: ReviewPacket, action: "review_packet_created" | "review_packet_updated"): Promise<void> {
    const current = await this.options.missionStore.readSession();
    const createdAt = this.now();
    await this.options.missionStore.writeSession(createRuntimeSessionSnapshot({
      ...current,
      runtime: {
        ...current.runtime,
        activityLog: [{
          id: `evt-${action}-${packet.id}-${createdAt}`,
          roleId: packet.createdByRoleId,
          type: "gate" as const,
          title: action === "review_packet_created" ? "Review packet created" : "Review packet updated",
          summary: packet.summary,
          tone: (packet.status === "ready" || packet.status === "delivered" ? "success" : packet.status === "blocked" ? "warning" : "info") as RuntimeActivityEvent["tone"],
          time: formatTime(createdAt)
        }, ...current.runtime.activityLog].slice(0, 80)
      },
      auditEvents: [createRuntimeAuditEvent({
        id: `audit-${action}-${packet.id}-${createdAt}`,
        actorRoleId: packet.createdByRoleId,
        action,
        summary: packet.summary,
        severity: packet.status === "ready" || packet.status === "delivered" ? "success" : packet.status === "blocked" ? "warning" : "info",
        entityId: packet.id,
        createdAt
      }), ...current.auditEvents].slice(0, 200),
      savedAt: createdAt
    }));
  }
}

function assessRequirements(
  toolCalls: readonly ToolCallRecord[],
  gitOperations: readonly GitOperationRecord[],
  requiredReviewers: readonly RoleId[],
  reviews: readonly ReviewerRecord[],
  ciRun?: LocalCiRun
): ReviewRequirement[] {
  const latestStatus = gitOperations.find((item) => item.kind === "status");
  const latestDiff = gitOperations.find((item) => item.kind === "diff");
  const latestPlan = gitOperations.find((item) => item.kind === "commit_plan");
  const writes = toolCalls.filter((item) => item.kind === "file_write" && item.status === "completed");
  const ciToolCallIds = new Set(ciRun?.commands.map((item) => item.toolCallId) ?? []);
  const tests = toolCalls.filter((item) => item.kind === "test_command" && (ciToolCallIds.size === 0 || ciToolCallIds.has(item.id)));
  const failedTest = tests.find((item) => item.status === "failed" || item.status === "blocked");
  const changedFiles = latestStatus?.result?.worktree?.files.filter((item) => !item.isDenied) ?? [];
  const deniedChanges = Boolean(latestStatus?.result?.worktree?.hasDeniedChanges);
  const passedReviewers = new Set(reviews.filter((item) => item.decision === "pass").map((item) => item.reviewerRoleId));
  const blockedReview = reviews.find((item) => item.decision === "block");

  return [
    requirement("changed_files", "Changed files", deniedChanges ? "block" : changedFiles.length > 0 || writes.length > 0 ? "pass" : "missing", deniedChanges ? "Denied paths are present in the worktree." : changedFiles.length > 0 || writes.length > 0 ? `${changedFiles.length || writes.length} local change(s) have evidence.` : "No local file-change evidence is attached.", [...changedFiles.map((item) => item.path), ...writes.map((item) => item.id)]),
    requirement("passing_tests", "Passing tests", failedTest || ciRun?.status === "failed" || ciRun?.status === "blocked" ? "block" : ciRun?.status === "passed" ? "pass" : tests.some((item) => item.status === "completed") ? "pass" : "missing", failedTest ? failedTest.errorSummary ?? failedTest.result?.summary ?? "A local test failed." : ciRun?.status === "passed" ? `Default local CI passed ${ciRun.commands.length} commands.` : "Run the default local CI profile before delivery.", tests.map((item) => item.id)),
    gitRequirement("git_status", "Git status", latestStatus, deniedChanges ? "Denied paths keep the packet blocked." : undefined),
    gitRequirement("git_diff", "Git diff", latestDiff),
    requirement("commit_plan", "Commit plan", !latestPlan ? "missing" : latestPlan.status !== "completed" || !latestPlan.result?.commitPlan?.ready ? "block" : "pass", !latestPlan ? "No commit plan is attached." : latestPlan.result?.commitPlan?.summary ?? latestPlan.errorSummary ?? "Commit plan is unavailable.", latestPlan ? [latestPlan.id] : []),
    requirement("reviewer_approval", "Reviewer approval", blockedReview ? "block" : requiredReviewers.every((roleId) => passedReviewers.has(roleId)) ? "pass" : "missing", blockedReview ? `${blockedReview.reviewerRoleId} blocked the packet: ${blockedReview.summary}` : `${passedReviewers.size}/${requiredReviewers.length} required reviewers passed.`, reviews.map((item) => `${item.reviewerRoleId}:${item.decision}`))
  ];
}

function gitRequirement(id: "git_status" | "git_diff", label: string, operation: GitOperationRecord | undefined, override?: string): ReviewRequirement {
  if (!operation) return requirement(id, label, "missing", `No ${label.toLowerCase()} evidence is attached.`, []);
  const status = operation.status === "completed" && !override ? "pass" : "block";
  return requirement(id, label, status, override ?? operation.result?.summary ?? operation.errorSummary ?? operation.policy.reason, [operation.id]);
}

function requirement(id: ReviewRequirement["id"], label: string, status: ReviewRequirement["status"], summary: string, evidenceIds: readonly string[]): ReviewRequirement {
  return { id, label, status, summary, evidenceIds };
}

function packetStatus(requirements: readonly ReviewRequirement[], reviews: readonly ReviewerRecord[], wasDelivered: boolean): ReviewPacketStatus {
  if (requirements.some((item) => item.status === "block")) return "blocked";
  if (reviews.some((item) => item.decision === "revise")) return "needs_revision";
  if (requirements.every((item) => item.status === "pass")) return wasDelivered ? "delivered" : "ready";
  return "draft";
}

function collectRisks(toolCalls: readonly ToolCallRecord[], operations: readonly GitOperationRecord[], missionRisks: readonly string[]): string[] {
  return unique([
    ...missionRisks,
    ...toolCalls.filter((item) => item.status === "failed" || item.status === "blocked").map((item) => item.errorSummary ?? `${item.kind} did not complete.`),
    ...operations.flatMap((item) => item.result?.commitPlan?.risks ?? []),
    ...operations.filter((item) => item.status === "failed" || item.status === "blocked").map((item) => item.errorSummary ?? `${item.kind} did not complete.`)
  ]).slice(0, 20);
}

function summaryForStatus(status: ReviewPacketStatus, requirements: readonly ReviewRequirement[]): string {
  const open = requirements.filter((item) => item.status !== "pass").length;
  if (status === "ready") return "All local evidence and reviewer requirements passed.";
  if (status === "delivered") return "Delivery report was generated from passing local evidence.";
  if (status === "blocked") {
    const blocked = requirements.filter((item) => item.status === "block").length;
    const missing = requirements.filter((item) => item.status === "missing").length;
    return `Review packet is blocked by ${blocked} requirement(s); ${missing} evidence item(s) remain open.`;
  }
  if (status === "needs_revision") return "A required reviewer requested revision.";
  return `Review packet needs ${open} more evidence requirement(s).`;
}

function deliverySections(packet: ReviewPacket): RuntimeArtifactSection[] {
  const passed = packet.requirements.filter((item) => item.status === "pass");
  const open = packet.requirements.filter((item) => item.status !== "pass");
  const changedFiles = packet.requirements.find((item) => item.id === "changed_files")?.evidenceIds ?? [];
  return [
    { heading: "Summary", body: packet.summary, evidence: [`Packet: ${packet.id}`, `Status: ${packet.status}`] },
    { heading: "Files Changed", body: changedFiles.length > 0 ? "Local file evidence is attached." : "No safe changed-file list is available.", evidence: changedFiles },
    { heading: "Verification", body: `${passed.length}/${packet.requirements.length} review requirements passed.`, evidence: packet.requirements.map((item) => `${item.label}: ${item.status}`) },
    { heading: "Risks", body: packet.risks.length > 0 ? "Known local risks remain recorded below." : "No additional local risks were recorded.", evidence: packet.risks },
    { heading: "Rollback", body: "No remote mutation was performed. Revert local file changes manually or with an approved non-destructive Git workflow.", evidence: ["Remote push disabled", "Remote PR creation disabled", "Deploy disabled"] },
    { heading: "Review Handoff", body: open.length === 0 ? "Ready for a human pull request or release note." : "Resolve the open evidence items before human delivery.", evidence: open.map((item) => `${item.label}: ${item.summary}`) }
  ];
}

function formatMarkdown(title: string, sections: readonly RuntimeArtifactSection[]): string {
  return [`# ${title}`, "", ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body, "", ...section.evidence.map((item) => `- ${item}`), ""])].join("\n").trim();
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(value));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
