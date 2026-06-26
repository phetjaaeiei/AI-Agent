import { randomUUID } from "node:crypto";
import type { ReviewExecutor } from "../../../packages/agent-core/src/index.js";
import type {
  AutomationDecision,
  AutomationEvidenceContext,
  GitOperationRecord,
  LocalReviewerResult,
  MissionControllerRecord,
  MissionControllerStage,
  MissionControllerStageResult,
  MissionControllerStartRequest,
  MissionControllerStopCode,
  MissionControllerStopReason,
  ReviewPacket,
  RoleId
} from "../../../packages/shared/src/index.js";
import {
  createDefaultAutomationPolicySnapshot,
  evaluateAutomationAction
} from "../../../packages/shared/src/index.js";
import {
  createRuntimeAuditEvent,
  createRuntimeMissionState,
  createRuntimeSessionSnapshot
} from "../../../packages/workflow/src/index.js";
import type { RuntimeActivityEvent, RuntimeAuditEvent } from "../../../packages/workflow/src/index.js";
import type { AgentRunService } from "./agent-run-service.js";
import type { GitOperationService } from "./git-operation-service.js";
import type { MissionControllerStore } from "./mission-controller-store.js";
import type { MissionStore } from "./mission-store.js";
import type { ReviewPacketService } from "./review-packet-service.js";
import type { ToolCallService } from "./tool-call-service.js";

type MissionControllerServiceOptions = {
  controllerStore: MissionControllerStore;
  missionStore: MissionStore;
  agentRunService: AgentRunService;
  toolCallService: ToolCallService;
  gitOperationService: GitOperationService;
  reviewPacketService: ReviewPacketService;
  reviewer: ReviewExecutor;
  historyRecorder?: {
    captureController(
      controller: MissionControllerRecord,
      archiveReason?: "controller_terminal" | "before_retry"
    ): Promise<unknown>;
  };
  now?: () => string;
  maxAttempts?: number;
  reviewerRevisionLimit?: number;
};

const REVIEWER_ROLES: readonly RoleId[] = ["tech_lead", "qa_lead", "lead_ba"];
const IMPLEMENTATION_PREVIEW_PATH = "apps/web/src/generated/mission-implementation-preview.ts";

type HandoffExecutionResult = {
  blocked: number;
  executed: number;
  failed: number;
  operations: readonly GitOperationRecord[];
  skipped: number;
  summaries: readonly string[];
};

export class MissionControllerService {
  private readonly active = new Map<string, AbortController>();
  private readonly now: () => string;
  private readonly maxAttempts: number;
  private readonly reviewerRevisionLimit: number;

  constructor(private readonly options: MissionControllerServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxAttempts = options.maxAttempts ?? 2;
    this.reviewerRevisionLimit = options.reviewerRevisionLimit ?? 1;
  }

  listControllers(missionId?: string): Promise<MissionControllerRecord[]> {
    return this.options.controllerStore.listControllers(missionId);
  }

  getController(controllerId: string): Promise<MissionControllerRecord | undefined> {
    return this.options.controllerStore.findController(controllerId);
  }

  async startController(input: MissionControllerStartRequest): Promise<MissionControllerRecord> {
    const command = input.command.trim();
    if (!command) throw new Error("Mission command is required.");
    const idempotencyKey = input.idempotencyKey?.trim() || `${input.missionId}:${input.taskId}:${command}`;
    const existing = await this.options.controllerStore.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;
    const createdAt = this.now();
    const controller: MissionControllerRecord = {
      schemaVersion: 1,
      id: `mission-controller-${randomUUID()}`,
      idempotencyKey,
      missionId: input.missionId,
      taskId: input.taskId,
      command,
      providerPreference: input.providerPreference ?? "auto",
      status: "queued",
      currentStage: "planning",
      attempt: 1,
      maxAttempts: this.maxAttempts,
      stageResults: [],
      reviewerResults: [],
      createdAt,
      updatedAt: createdAt
    };
    await this.options.controllerStore.upsertController(controller);
    await this.persistActivity(controller, "Mission controller queued", "The local completion loop is ready to start.", "info");
    queueMicrotask(() => void this.executeController(controller.id));
    return controller;
  }

  async cancelController(controllerId: string): Promise<MissionControllerRecord> {
    const controller = await this.requireController(controllerId);
    if (isTerminal(controller.status)) return controller;
    this.active.get(controllerId)?.abort();
    if (controller.agentRunId) await this.options.agentRunService.cancelRun(controller.agentRunId);
    const completedAt = this.now();
    const cancelled = await this.patch(controller, {
      status: "cancelled",
      stopReason: {
        code: "cancelled",
        stage: controller.currentStage,
        message: "Mission controller cancelled by user.",
        evidenceIds: []
      },
      stageResults: upsertStageResult(controller.stageResults, {
        stage: controller.currentStage,
        status: "cancelled",
        attempt: controller.attempt,
        summary: "Cancelled by user.",
        evidenceIds: [],
        startedAt: controller.stageResults.find((item) => item.stage === controller.currentStage && item.attempt === controller.attempt)?.startedAt ?? completedAt,
        completedAt
      }),
      completedAt,
      updatedAt: completedAt
    });
    await this.persistActivity(cancelled, "Mission controller cancelled", cancelled.stopReason!.message, "warning");
    await this.options.historyRecorder?.captureController(cancelled);
    return cancelled;
  }

  async retryController(controllerId: string): Promise<MissionControllerRecord> {
    const controller = await this.requireController(controllerId);
    if (!isTerminal(controller.status) || controller.status === "completed") throw new Error("Only blocked, failed, or cancelled controllers can be retried.");
    if (controller.attempt >= controller.maxAttempts) throw new Error("Mission controller retry limit reached.");
    await this.options.historyRecorder?.captureController(controller, "before_retry");
    const {
      agentRunId: _agentRunId,
      reviewPacketId: _reviewPacketId,
      deliveryArtifactContentId: _deliveryArtifactContentId,
      stopReason: _stopReason,
      completedAt: _completedAt,
      ...retryBase
    } = controller;
    const queued = await this.options.controllerStore.upsertController({
      ...retryBase,
      status: "queued",
      currentStage: "planning",
      attempt: controller.attempt + 1,
      reviewerResults: [],
      updatedAt: this.now()
    });
    queueMicrotask(() => void this.executeController(queued.id));
    return queued;
  }

  async resumeController(controllerId: string): Promise<MissionControllerRecord> {
    const controller = await this.requireController(controllerId);
    if (!controller.status || !["queued", "running"].includes(controller.status)) throw new Error("Only queued or interrupted controllers can resume.");
    if (!this.active.has(controller.id)) queueMicrotask(() => void this.executeController(controller.id));
    return controller;
  }

  async recoverInterruptedControllers(): Promise<number> {
    const interrupted = (await this.listControllers()).filter((item) => item.status === "queued" || item.status === "running");
    for (const controller of interrupted) {
      if (!this.active.has(controller.id)) queueMicrotask(() => void this.executeController(controller.id));
    }
    return interrupted.length;
  }

  async waitForTerminalController(controllerId: string, timeoutMs = 10_000): Promise<MissionControllerRecord> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const controller = await this.getController(controllerId);
      if (controller && isTerminal(controller.status)) return controller;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${controllerId}.`);
  }

  private async executeController(controllerId: string): Promise<void> {
    if (this.active.has(controllerId)) return;
    let controller = await this.getController(controllerId);
    if (!controller || isTerminal(controller.status)) return;
    const abortController = new AbortController();
    this.active.set(controllerId, abortController);

    try {
      controller = await this.patch(controller, {
        status: "running",
        startedAt: controller.startedAt ?? this.now(),
        updatedAt: this.now()
      });
      controller = await this.runPlanning(controller, abortController.signal);
      controller = await this.runImplementationPatch(controller, abortController.signal);
      controller = await this.runToolEvidence(controller, abortController.signal);
      controller = await this.runGitEvidence(controller, abortController.signal);
      controller = await this.runReviewPacket(controller, abortController.signal);
      controller = await this.runLocalCi(controller, abortController.signal);
      controller = await this.runReviewers(controller, abortController.signal);
      controller = await this.runDelivery(controller, abortController.signal);
      controller = await this.runHandoffPolicy(controller, abortController.signal);
      this.assertActive(controller, abortController.signal);
      const completedAt = this.now();
      controller = await this.patch(controller, { status: "completed", completedAt, updatedAt: completedAt });
      await this.persistActivity(controller, "Mission completed", "All local stages passed and the delivery report is ready.", "success");
      await this.options.historyRecorder?.captureController(controller);
    } catch (error) {
      const persisted = await this.getController(controllerId);
      if (!persisted || persisted.status === "cancelled") return;
      controller = persisted;
      const stopped = normalizeStop(error, persisted.currentStage);
      const completedAt = this.now();
      const status = stopped.code === "unexpected" ? "failed" : stopped.code === "cancelled" ? "cancelled" : "blocked";
      controller = await this.patch(controller, {
        status,
        stopReason: stopped,
        stageResults: upsertStageResult(controller.stageResults, {
          stage: stopped.stage,
          status: status === "failed" ? "failed" : status === "cancelled" ? "cancelled" : "blocked",
          attempt: controller.attempt,
          summary: stopped.message,
          evidenceIds: stopped.evidenceIds,
          startedAt: persisted.stageResults.find((item) => item.stage === stopped.stage && item.attempt === persisted.attempt)?.startedAt ?? completedAt,
          completedAt
        }),
        completedAt,
        updatedAt: completedAt
      });
      await this.persistActivity(controller, status === "failed" ? "Mission controller failed" : "Mission controller stopped", stopped.message, status === "failed" ? "danger" : "warning");
      await this.options.historyRecorder?.captureController(controller);
    } finally {
      this.active.delete(controllerId);
    }
  }

  private async runPlanning(controller: MissionControllerRecord, signal: AbortSignal): Promise<MissionControllerRecord> {
    controller = await this.beginStage(controller, "planning", "Running local Product Manager and Lead BA planning.");
    this.assertActive(controller, signal);
    const run = await this.options.agentRunService.startRun({
      missionId: controller.missionId,
      taskId: controller.taskId,
      command: controller.command,
      idempotencyKey: `${controller.id}:attempt:${controller.attempt}:planning`,
      providerPreference: controller.providerPreference
    });
    controller = await this.patch(controller, { agentRunId: run.id, updatedAt: this.now() });
    const terminal = await this.options.agentRunService.waitForTerminalRun(run.id, 130_000);
    this.assertActive(controller, signal);
    if (terminal.status !== "completed") {
      throw new ControllerStopError("planning_blocked", "planning", terminal.errorSummary ?? `Planning ended with ${terminal.status}.`, [terminal.id]);
    }
    return this.completeStage(controller, "planning", `Planning completed with ${terminal.provider}.`, [terminal.id, ...(terminal.outputArtifactId ? [terminal.outputArtifactId] : [])]);
  }

  private async runImplementationPatch(controller: MissionControllerRecord, signal: AbortSignal): Promise<MissionControllerRecord> {
    controller = await this.beginStage(controller, "implementation_patch", "Writing a bounded local implementation patch.");
    this.assertActive(controller, signal);
    const generatedAt = this.now();
    const call = await this.options.toolCallService.executeToolCall({
      missionId: controller.missionId,
      taskId: controller.taskId,
      roleId: "frontend_developer",
      kind: "file_write",
      targetPath: IMPLEMENTATION_PREVIEW_PATH,
      content: createImplementationPreviewSource(controller.command, generatedAt)
    });
    if (call.status !== "completed") {
      throw new ControllerStopError("implementation_failed", "implementation_patch", call.errorSummary ?? "Implementation patch did not complete.", [call.id]);
    }
    return this.completeStage(controller, "implementation_patch", `Implementation patch wrote ${IMPLEMENTATION_PREVIEW_PATH}.`, [call.id, ...(call.artifactContentId ? [call.artifactContentId] : [])]);
  }

  private async runToolEvidence(controller: MissionControllerRecord, signal: AbortSignal): Promise<MissionControllerRecord> {
    controller = await this.beginStage(controller, "tool_evidence", "Collecting bounded local tool evidence.");
    this.assertActive(controller, signal);
    const call = await this.options.toolCallService.executeToolCall({
      missionId: controller.missionId,
      taskId: controller.taskId,
      roleId: "automation_qa",
      kind: "test_command",
      command: "npm run typecheck"
    });
    if (call.status !== "completed") throw new ControllerStopError("tool_failed", "tool_evidence", call.errorSummary ?? "Local typecheck evidence failed.", [call.id]);
    return this.completeStage(controller, "tool_evidence", "Local typecheck evidence passed.", [call.id]);
  }

  private async runGitEvidence(controller: MissionControllerRecord, signal: AbortSignal): Promise<MissionControllerRecord> {
    controller = await this.beginStage(controller, "git_evidence", "Collecting Git status, diff, and commit-plan evidence.");
    this.assertActive(controller, signal);
    const operations: GitOperationRecord[] = [];
    for (const kind of ["status", "diff", "commit_plan"] as const) {
      const operation = await this.options.gitOperationService.executeOperation({
        missionId: controller.missionId,
        taskId: controller.taskId,
        roleId: "tech_lead",
        kind,
        ...(kind === "commit_plan" ? { baseBranch: "main" } : {})
      });
      operations.push(operation);
      if (operation.status !== "completed") {
        throw new ControllerStopError("git_policy", "git_evidence", operation.errorSummary ?? `${kind} evidence did not complete.`, operations.map((item) => item.id));
      }
    }
    const plan = operations.at(-1)?.result?.commitPlan;
    if (!plan?.ready) throw new ControllerStopError("git_not_ready", "git_evidence", plan?.summary ?? "Commit plan is not ready.", operations.map((item) => item.id));
    return this.completeStage(controller, "git_evidence", plan.summary, operations.map((item) => item.id));
  }

  private async runReviewPacket(controller: MissionControllerRecord, signal: AbortSignal): Promise<MissionControllerRecord> {
    controller = await this.beginStage(controller, "review_packet", "Creating the review evidence packet.");
    this.assertActive(controller, signal);
    const packet = controller.reviewPacketId
      ? await this.options.reviewPacketService.refreshPacket(controller.reviewPacketId)
      : await this.options.reviewPacketService.createPacket({ missionId: controller.missionId, taskId: controller.taskId, roleId: "tech_lead" });
    controller = await this.patch(controller, { reviewPacketId: packet.id, updatedAt: this.now() });
    const hardBlocks = packet.requirements.filter((item) => item.id !== "passing_tests" && item.id !== "reviewer_approval" && item.status === "block");
    if (hardBlocks.length > 0) throw new ControllerStopError("git_not_ready", "review_packet", hardBlocks.map((item) => item.summary).join(" "), [packet.id]);
    return this.completeStage(controller, "review_packet", packet.summary, [packet.id]);
  }

  private async runLocalCi(controller: MissionControllerRecord, signal: AbortSignal): Promise<MissionControllerRecord> {
    controller = await this.beginStage(controller, "local_ci", "Running the local CI command profile.");
    this.assertActive(controller, signal);
    const packet = await this.requireReviewPacket(controller);
    const withCi = packet.ciRun?.status === "passed" ? packet : await this.options.reviewPacketService.runLocalCi(packet.id);
    if (withCi.ciRun?.status !== "passed") {
      throw new ControllerStopError("ci_failed", "local_ci", `Local CI ended with ${withCi.ciRun?.status ?? "missing"}.`, [packet.id, ...(withCi.ciRun?.commands.map((item) => item.toolCallId) ?? [])]);
    }
    return this.completeStage(controller, "local_ci", `Local CI passed ${withCi.ciRun.commands.length} commands.`, [packet.id, ...withCi.ciRun.commands.map((item) => item.toolCallId)]);
  }

  private async runReviewers(controller: MissionControllerRecord, signal: AbortSignal): Promise<MissionControllerRecord> {
    controller = await this.beginStage(controller, "reviewers", "Running independent local reviewer agents.");
    let packet = await this.requireReviewPacket(controller);
    const results = [...controller.reviewerResults];
    for (const reviewerRoleId of REVIEWER_ROLES) {
      const existing = results.find((item) => item.reviewerRoleId === reviewerRoleId && item.decision === "pass");
      if (existing) continue;
      let result: LocalReviewerResult | undefined;
      for (let revision = 0; revision <= this.reviewerRevisionLimit; revision += 1) {
        this.assertActive(controller, signal);
        result = await this.options.reviewer.execute({ packet, reviewerRoleId }, signal);
        results.splice(0, results.length, result, ...results.filter((item) => item.reviewerRoleId !== reviewerRoleId));
        controller = await this.patch(controller, { reviewerResults: results, updatedAt: this.now() });
        packet = await this.options.reviewPacketService.recordDecision(packet.id, {
          reviewerRoleId,
          decision: result.decision,
          summary: result.summary
        });
        if (result.decision === "pass" || result.decision === "block") break;
        packet = await this.options.reviewPacketService.refreshPacket(packet.id);
      }
      if (!result || result.decision === "block") {
        throw new ControllerStopError("review_blocked", "reviewers", result?.summary ?? `${reviewerRoleId} produced no decision.`, [packet.id, ...(result?.evidenceIds ?? [])]);
      }
      if (result.decision === "revise") throw new ControllerStopError("review_revise", "reviewers", result.summary, [packet.id, ...result.evidenceIds]);
    }
    packet = await this.options.reviewPacketService.refreshPacket(packet.id);
    if (packet.status !== "ready") throw new ControllerStopError("review_blocked", "reviewers", packet.summary, [packet.id]);
    return this.completeStage(controller, "reviewers", "Tech Lead, QA Lead, and Lead BA passed the packet.", [packet.id, ...results.flatMap((item) => item.evidenceIds)]);
  }

  private async runDelivery(controller: MissionControllerRecord, signal: AbortSignal): Promise<MissionControllerRecord> {
    controller = await this.beginStage(controller, "delivery", "Generating the offline delivery report.");
    this.assertActive(controller, signal);
    const packet = await this.requireReviewPacket(controller);
    const delivered = packet.status === "delivered" ? packet : await this.options.reviewPacketService.createDeliveryPacket(packet.id);
    if (delivered.status !== "delivered" || !delivered.deliveryArtifactContentId) {
      throw new ControllerStopError("delivery_not_ready", "delivery", delivered.summary, [delivered.id]);
    }
    controller = await this.patch(controller, { deliveryArtifactContentId: delivered.deliveryArtifactContentId, updatedAt: this.now() });
    return this.completeStage(controller, "delivery", "Offline delivery report generated.", [delivered.id, delivered.deliveryArtifactContentId]);
  }

  private async runHandoffPolicy(controller: MissionControllerRecord, signal: AbortSignal): Promise<MissionControllerRecord> {
    controller = await this.beginStage(controller, "handoff_policy", "Evaluating guarded automation handoff policy.");
    await this.persistAutomationHandoffActivity(controller, "Automation handoff preflight started", "Checking bounded-auto eligibility without executing remote or deployment actions.", "info");
    this.assertActive(controller, signal);

    const packet = await this.requireReviewPacket(controller);
    const branchName = `codex/${slugForBranch(controller.taskId)}`;
    const operations: GitOperationRecord[] = [];

    for (const kind of ["remote_evidence", "branch_push_policy", "draft_pr_policy"] as const) {
      const operation = await this.options.gitOperationService.executeOperation({
        missionId: controller.missionId,
        taskId: controller.taskId,
        roleId: "release_manager",
        kind,
        baseBranch: "main",
        branchName,
        reviewPacketId: packet.id
      });
      operations.push(operation);
    }

    const decisions = createHandoffAutomationDecisions({
      gitPolicy: this.options.gitOperationService.getPolicy(),
      operations,
      packet,
      checkedAt: this.now()
    });
    const execution = await this.runBoundedRemoteHandoffExecutions({
      branchName,
      controller,
      decisions,
      packet,
      signal
    });
    const autoReady = decisions.filter((decision) => decision.canRunAutomatically).length;
    const blocked = decisions.filter((decision) => decision.blockers.length > 0 || decision.disabled).length;
    const summary = createHandoffSummary({ autoReady, blocked, execution });

    controller = await this.patch(controller, { automationDecisions: decisions, updatedAt: this.now() });
    controller = await this.completeStage(controller, "handoff_policy", summary, [
      ...operations.map((operation) => operation.id),
      ...execution.operations.map((operation) => operation.id)
    ]);
    await this.persistAutomationHandoffActivity(controller, "Automation handoff preflight completed", summary, autoReady > 0 ? "success" : "warning");
    return controller;
  }

  private async runBoundedRemoteHandoffExecutions({
    branchName,
    controller,
    decisions,
    packet,
    signal
  }: {
    branchName: string;
    controller: MissionControllerRecord;
    decisions: readonly AutomationDecision[];
    packet: ReviewPacket;
    signal: AbortSignal;
  }): Promise<HandoffExecutionResult> {
    const candidates = [
      { decisionKind: "git_branch_push", operationKind: "branch_push", label: "Branch push" },
      { decisionKind: "git_draft_pr_create", operationKind: "draft_pr_create", label: "Draft PR creation" }
    ] as const;
    const executable = candidates.filter((candidate) =>
      decisions.some((decision) => decision.kind === candidate.decisionKind && decision.canRunAutomatically)
    );

    if (executable.length === 0) {
      const skipped = candidates.length;
      await this.persistAutomationHandoffActivity(
        controller,
        "Remote handoff execution skipped",
        "No remote handoff action met bounded-auto policy requirements.",
        "warning",
        "automation_handoff_execution_skipped"
      );
      return {
        blocked: 0,
        executed: 0,
        failed: 0,
        operations: [],
        skipped,
        summaries: ["No remote handoff action met bounded-auto policy requirements."]
      };
    }

    await this.persistAutomationHandoffActivity(
      controller,
      "Remote handoff execution started",
      `${executable.length} remote handoff action(s) passed the bounded-auto policy gate.`,
      "info",
      "automation_handoff_execution_started"
    );

    const operations: GitOperationRecord[] = [];
    const summaries: string[] = [];
    let executed = 0;
    let blocked = 0;
    let failed = 0;
    let skipped = candidates.length - executable.length;

    for (const candidate of candidates) {
      const decision = decisions.find((item) => item.kind === candidate.decisionKind);
      if (!decision?.canRunAutomatically) {
        summaries.push(`${candidate.label} skipped: ${decision?.reason ?? "no automation decision was recorded"}.`);
        continue;
      }

      this.assertActive(controller, signal);
      const operation = await this.options.gitOperationService.executeOperation({
        missionId: controller.missionId,
        taskId: controller.taskId,
        roleId: "release_manager",
        kind: candidate.operationKind,
        baseBranch: "main",
        branchName,
        reviewPacketId: packet.id
      });
      operations.push(operation);

      if (operation.status === "completed") {
        executed += 1;
        summaries.push(`${candidate.label} completed: ${operation.result?.summary ?? operation.policy.reason}`);
        continue;
      }

      if (operation.status === "blocked") blocked += 1;
      else failed += 1;
      summaries.push(`${candidate.label} ${operation.status}: ${operation.errorSummary ?? operation.policy.reason}`);

      if (candidate.operationKind === "branch_push") {
        const draftCandidate = candidates.find((item) => item.operationKind === "draft_pr_create");
        if (draftCandidate && decisions.some((item) => item.kind === draftCandidate.decisionKind && item.canRunAutomatically)) {
          skipped += 1;
          summaries.push("Draft PR creation skipped because branch push did not complete.");
        }
        break;
      }
    }

    const tone: RuntimeActivityEvent["tone"] = failed > 0 ? "danger" : blocked > 0 ? "warning" : "success";
    await this.persistAutomationHandoffActivity(
      controller,
      "Remote handoff execution completed",
      `Remote handoff execution finished with ${executed} completed, ${blocked} blocked, ${failed} failed, and ${skipped} skipped action(s).`,
      tone,
      "automation_handoff_execution_completed"
    );

    return { blocked, executed, failed, operations, skipped, summaries };
  }

  private async beginStage(controller: MissionControllerRecord, stage: MissionControllerStage, summary: string): Promise<MissionControllerRecord> {
    const startedAt = this.now();
    return this.patch(controller, {
      currentStage: stage,
      stageResults: upsertStageResult(controller.stageResults, { stage, status: "running", attempt: controller.attempt, summary, evidenceIds: [], startedAt }),
      updatedAt: startedAt
    });
  }

  private async completeStage(controller: MissionControllerRecord, stage: MissionControllerStage, summary: string, evidenceIds: readonly string[]): Promise<MissionControllerRecord> {
    const completedAt = this.now();
    const current = controller.stageResults.find((item) => item.stage === stage && item.attempt === controller.attempt);
    return this.patch(controller, {
      stageResults: upsertStageResult(controller.stageResults, {
        stage,
        status: "completed",
        attempt: controller.attempt,
        summary,
        evidenceIds,
        startedAt: current?.startedAt ?? completedAt,
        completedAt
      }),
      updatedAt: completedAt
    });
  }

  private assertActive(controller: MissionControllerRecord, signal: AbortSignal): void {
    if (signal.aborted || controller.status === "cancelled") throw new ControllerStopError("cancelled", controller.currentStage, "Mission controller cancelled by user.", []);
  }

  private async requireReviewPacket(controller: MissionControllerRecord): Promise<ReviewPacket> {
    const packet = controller.reviewPacketId ? await this.options.reviewPacketService.getPacket(controller.reviewPacketId) : undefined;
    if (!packet) throw new ControllerStopError("unexpected", controller.currentStage, "Review packet is missing.", []);
    return packet;
  }

  private requireController(controllerId: string): Promise<MissionControllerRecord> {
    return this.options.controllerStore.findController(controllerId).then((controller) => {
      if (!controller) throw new Error("Mission controller not found.");
      return controller;
    });
  }

  private patch(controller: MissionControllerRecord, patch: Partial<MissionControllerRecord>): Promise<MissionControllerRecord> {
    return this.options.controllerStore.upsertController({ ...controller, ...patch });
  }

  private async persistActivity(controller: MissionControllerRecord, title: string, summary: string, tone: RuntimeActivityEvent["tone"]): Promise<void> {
    const current = await this.options.missionStore.readSession();
    const createdAt = this.now();
    const terminal = isTerminal(controller.status);
    const missionStatus = controller.status === "completed" ? "delivered" : terminal ? "blocked" : "running";
    const statusReason = controller.stopReason?.message ?? summary;
    const activity: RuntimeActivityEvent = {
      id: `evt-controller-${controller.id}-${controller.status}-${controller.attempt}`,
      roleId: terminal && controller.status === "completed" ? "chief_of_staff" : "project_manager",
      type: controller.status === "blocked" || controller.status === "failed" ? "risk" : "phase",
      title,
      summary,
      tone,
      time: formatTime(createdAt)
    };
    await this.options.missionStore.writeSession(createRuntimeSessionSnapshot({
      ...current,
      missionState: createRuntimeMissionState({
        commandDraft: current.commandDraft,
        missionPlan: current.missionPlan,
        savedAt: createdAt,
        previousState: current.missionState,
        source: "mission_controller",
        status: missionStatus,
        statusReason
      }),
      runtime: {
        ...current.runtime,
        activityLog: [activity, ...current.runtime.activityLog].slice(0, 80)
      },
      auditEvents: [createRuntimeAuditEvent({
        id: `audit-controller-${controller.id}-${controller.status}-${controller.attempt}`,
        actorRoleId: terminal && controller.status === "completed" ? "chief_of_staff" : "project_manager",
        action: terminal && controller.status === "completed" ? "mission_controller_completed" : terminal ? "mission_controller_stopped" : "mission_controller_started",
        summary,
        severity: tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "success" ? "success" : "info",
        entityId: controller.id,
        createdAt
      }), ...current.auditEvents].slice(0, 200),
      savedAt: createdAt
    }));
  }

  private async persistAutomationHandoffActivity(
    controller: MissionControllerRecord,
    title: string,
    summary: string,
    tone: RuntimeActivityEvent["tone"],
    action?: RuntimeAuditEvent["action"]
  ): Promise<void> {
    const current = await this.options.missionStore.readSession();
    const createdAt = this.now();
    const severity = tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "success" ? "success" : "info";
    const activity: RuntimeActivityEvent = {
      id: `evt-automation-handoff-${controller.id}-${controller.attempt}-${createdAt}`,
      roleId: "release_manager",
      type: tone === "warning" || tone === "danger" ? "risk" : "phase",
      title,
      summary,
      tone,
      time: formatTime(createdAt)
    };
    await this.options.missionStore.writeSession(createRuntimeSessionSnapshot({
      ...current,
      runtime: {
        ...current.runtime,
        activityLog: [activity, ...current.runtime.activityLog].slice(0, 80)
      },
      auditEvents: [createRuntimeAuditEvent({
        id: `audit-automation-handoff-${controller.id}-${controller.attempt}-${createdAt}`,
        actorRoleId: "release_manager",
        action: action ?? (title.includes("completed") ? "automation_handoff_completed" : "automation_handoff_started"),
        summary,
        severity,
        entityId: controller.id,
        createdAt
      }), ...current.auditEvents].slice(0, 200),
      savedAt: createdAt
    }));
  }
}

function createHandoffAutomationDecisions({
  checkedAt,
  gitPolicy,
  operations,
  packet
}: {
  checkedAt: string;
  gitPolicy: ReturnType<GitOperationService["getPolicy"]>;
  operations: readonly GitOperationRecord[];
  packet: ReviewPacket;
}): AutomationDecision[] {
  const snapshot = createDefaultAutomationPolicySnapshot(checkedAt);
  const remoteEvidence = operations.find((operation) => operation.kind === "remote_evidence")?.result?.remoteEvidence;
  const worktree = operations.find((operation) => operation.result?.worktree)?.result?.worktree;
  const reviewerApproval = packet.requiredReviewerRoleIds.length > 0 &&
    packet.requiredReviewerRoleIds.every((roleId) =>
      packet.reviews.some((review) => review.reviewerRoleId === roleId && review.decision === "pass")
    );
  const evidence: AutomationEvidenceContext = {
    policy_switch_enabled: gitPolicy.allowRemotePush || gitPolicy.allowPullRequestCreate,
    connector_policy_present: gitPolicy.allowRemotePush || gitPolicy.allowPullRequestCreate,
    reviewed_delivery: packet.status === "delivered" && Boolean(packet.deliveryArtifactContentId),
    passing_local_ci: packet.ciRun?.status === "passed",
    reviewer_approval: reviewerApproval,
    remote_branch_current: remoteEvidence?.publicationState === "published_current" && worktree?.isClean === true,
    draft_pr_open: remoteEvidence?.pullRequest.state === "open",
    rollback_plan: false,
    staging_smoke_passed: false,
    production_approval: false,
    bounded_retry_budget: false,
    no_secret_material: worktree ? !worktree.hasDeniedChanges : false
  };
  return ([
    "git_branch_push",
    "git_draft_pr_create",
    "deploy_staging",
    "pull_request_merge",
    "deploy_production",
    "force_push",
    "branch_delete",
    "destructive_git_reset",
    "destructive_git_checkout",
    "secret_serialization",
    "silent_fine_tuning",
    "unbounded_autonomous_loop"
  ] as const).map((kind) => evaluateAutomationAction(snapshot, { kind, requestedMode: "auto", evidence }, checkedAt));
}

function createHandoffSummary({
  autoReady,
  blocked,
  execution
}: {
  autoReady: number;
  blocked: number;
  execution: HandoffExecutionResult;
}): string {
  if (autoReady === 0) {
    return `No remote or deployment action is eligible for bounded-auto handoff; ${blocked} action(s) remain blocked, manual, or disabled. Remote handoff execution skipped.`;
  }

  const executionSummary = `${execution.executed} executed, ${execution.blocked} blocked, ${execution.failed} failed, ${execution.skipped} skipped.`;
  return `${autoReady} guarded automation action(s) are eligible for bounded-auto handoff. Remote handoff execution: ${executionSummary}`;
}

class ControllerStopError extends Error {
  constructor(
    readonly code: MissionControllerStopCode,
    readonly stage: MissionControllerStage,
    message: string,
    readonly evidenceIds: readonly string[]
  ) {
    super(message);
    this.name = "ControllerStopError";
  }
}

function normalizeStop(error: unknown, stage: MissionControllerStage): MissionControllerStopReason {
  if (error instanceof ControllerStopError) return { code: error.code, stage: error.stage, message: error.message, evidenceIds: error.evidenceIds };
  return { code: "unexpected", stage, message: error instanceof Error ? error.message : "Unknown mission controller error.", evidenceIds: [] };
}

function upsertStageResult(results: readonly MissionControllerStageResult[], next: MissionControllerStageResult): MissionControllerStageResult[] {
  return [next, ...results.filter((item) => item.stage !== next.stage || item.attempt !== next.attempt)];
}

function isTerminal(status: MissionControllerRecord["status"]): boolean {
  return ["completed", "blocked", "failed", "cancelled"].includes(status);
}

function createImplementationPreviewSource(command: string, generatedAt: string): string {
  const normalizedCommand = command.trim().replace(/\s+/g, " ");
  const isLandingPage = /\b(landing|homepage|marketing|hero|webapp|launch)\b/i.test(normalizedCommand);
  const title = isLandingPage ? "Team AI Agent Landing Page" : "Mission Implementation Preview";
  const summary = isLandingPage
    ? "Generated landing-page preview content for the Team AI Agent web app, ready for review and rendered QA wiring."
    : "Generated implementation preview content from the current mission command, ready for review and test evidence.";
  const sections = isLandingPage
    ? [
      {
        label: "Hero",
        summary: "Position Team AI Agent as a local-first AI company control room with one mission intake and inspectable execution evidence."
      },
      {
        label: "Proof",
        summary: "Show planning, implementation patch, tests, review packet, delivery report, and handoff policy as visible checkpoints."
      },
      {
        label: "Action",
        summary: "Invite operators to save a mission, run local agents, inspect artifacts, and keep merge or deployment manual."
      }
    ]
    : [
      {
        label: "Implementation",
        summary: "Create a bounded local patch through the tool-runner file_write policy before collecting Git evidence."
      },
      {
        label: "Verification",
        summary: "Feed the generated patch into typecheck, local CI, reviewer decisions, delivery report, and mission history recovery."
      },
      {
        label: "Safety",
        summary: "Keep the change local and reviewable; remote push, PR creation, merge, and deploy stay behind policy gates."
      }
    ];
  const preview = {
    schemaVersion: 1,
    generatedAt,
    source: "mission_controller",
    command: normalizedCommand || "No mission command provided.",
    title,
    summary,
    targetPath: IMPLEMENTATION_PREVIEW_PATH,
    sections
  };

  return [
    "export type MissionImplementationPreviewSection = {",
    "  label: string;",
    "  summary: string;",
    "};",
    "",
    "export type MissionImplementationPreview = {",
    "  schemaVersion: 1;",
    "  generatedAt: string;",
    "  source: \"mission_controller\" | \"seed\";",
    "  command: string;",
    "  title: string;",
    "  summary: string;",
    "  targetPath: string;",
    "  sections: readonly MissionImplementationPreviewSection[];",
    "};",
    "",
    `export const missionImplementationPreview: MissionImplementationPreview = ${JSON.stringify(preview, null, 2)};`,
    ""
  ].join("\n");
}

function slugForBranch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^-+|-+$/g, "")
    .replace(/\/$/g, "") || "mission-handoff";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(value));
}
