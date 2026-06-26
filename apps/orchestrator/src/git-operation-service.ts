import { randomUUID } from "node:crypto";
import type { GitRunner } from "../../../packages/git-runner/src/index.js";
import { GitExecutionError } from "../../../packages/git-runner/src/index.js";
import type {
  GitFailureCode,
  GitOperationRecord,
  GitOperationRequest,
  GitOperationResult,
  GitPolicyDecision,
  GitPolicySnapshot,
  GitRemoteMutationPolicy,
  ReviewPacket,
  ToolCallRecord
} from "../../../packages/shared/src/index.js";
import {
  createRuntimeArtifactRecord,
  createRuntimeAuditEvent,
  createRuntimeSessionSnapshot
} from "../../../packages/workflow/src/index.js";
import type { RuntimeActivityEvent, RuntimeArtifactContent, RuntimeArtifactSection } from "../../../packages/workflow/src/index.js";
import type { ArtifactContentStore } from "./artifact-content-store.js";
import type { MissionStore } from "./mission-store.js";
import type { GitOperationStore } from "./git-operation-store.js";
import type { ReviewPacketStore } from "./review-packet-store.js";
import type { ToolCallStore } from "./tool-call-store.js";

type GitOperationServiceOptions = {
  runner: GitRunner;
  operationStore: GitOperationStore;
  missionStore: MissionStore;
  artifactStore: ArtifactContentStore;
  reviewPacketStore?: ReviewPacketStore;
  toolCallStore?: ToolCallStore;
  now?: () => string;
};

type ReviewedImplementationTarget = {
  artifactContentId?: string;
  artifactRecordId?: string;
  summary: string;
  targetPath: string;
};

type ReviewedDeliveryEvidence = {
  blockers: string[];
  deliveryArtifact?: RuntimeArtifactContent;
  implementationTargets: readonly ReviewedImplementationTarget[];
  packet?: ReviewPacket;
};

const IMPLEMENTATION_PREVIEW_TARGET_PATH = "apps/web/src/generated/mission-implementation-preview.ts";
const IMPLEMENTATION_SURFACE_TARGET_PREFIX = "apps/web/src/generated/implementation-surfaces/";

export class GitOperationService {
  private readonly now: () => string;

  constructor(private readonly options: GitOperationServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  getPolicy(): GitPolicySnapshot {
    return this.options.runner.getPolicy();
  }

  listOperations(missionId?: string): Promise<GitOperationRecord[]> {
    return this.options.operationStore.listOperations(missionId);
  }

  getOperation(operationId: string): Promise<GitOperationRecord | undefined> {
    return this.options.operationStore.findOperation(operationId);
  }

  async executeOperation(input: GitOperationRequest): Promise<GitOperationRecord> {
    const requestedAt = this.now();
    const id = `git-op-${randomUUID()}`;
    let executionRequest = { ...input, id };
    const policy = this.evaluatePolicy(executionRequest);
    const initial: GitOperationRecord = {
      schemaVersion: 1,
      id,
      missionId: input.missionId,
      taskId: input.taskId,
      roleId: input.roleId,
      kind: input.kind,
      status: policy.allowed ? "queued" : "blocked",
      policy,
      requestedAt,
      updatedAt: requestedAt,
      ...(input.cwd ? { cwd: input.cwd } : {})
    };
    let operation = await this.options.operationStore.upsertOperation(initial);

    if (!policy.allowed) {
      operation = await this.patchOperation(operation, {
        status: "blocked",
        errorCode: errorCodeForPolicy(input.kind, policy.reason),
        errorSummary: policy.reason,
        completedAt: this.now(),
        updatedAt: this.now()
      });
      await this.persistSessionEvidence(operation);
      return operation;
    }

    if (requiresReviewedDeliveryBeforeExecution(input.kind)) {
      const review = await this.resolveReviewedDelivery(input);
      if (review.blockers.length > 0) {
        const reason = `Remote mutation blocked before execution: ${review.blockers.join(" ")}`;
        operation = await this.patchOperation(operation, {
          status: "blocked",
          policy: { ...policy, allowed: false, reason },
          errorCode: "remote_disabled",
          errorSummary: reason,
          completedAt: this.now(),
          updatedAt: this.now()
        });
        await this.persistSessionEvidence(operation);
        return operation;
      }
      if (review.packet) {
        executionRequest = this.attachReviewedDeliveryToDraftPr(executionRequest, review);
      }
    }

    operation = await this.patchOperation(operation, { status: "running", startedAt: this.now(), updatedAt: this.now() });
    await this.persistSessionEvidence(operation);

    try {
      const result = await this.finalizeRemoteMutationPolicy(input, await this.options.runner.execute(executionRequest));
      const artifact = shouldCreateArtifact(operation, result) ? await this.persistGitArtifact(operation, result) : undefined;
      operation = await this.patchOperation(operation, {
        status: "completed",
        result,
        ...(artifact ? { artifactRecordId: artifact.artifactRecordId, artifactContentId: artifact.id } : {}),
        completedAt: this.now(),
        updatedAt: this.now()
      });
      await this.persistSessionEvidence(operation);
      return operation;
    } catch (error) {
      const normalized = normalizeGitError(error);
      operation = await this.patchOperation(operation, {
        status: isPolicyFailure(normalized.code) ? "blocked" : "failed",
        errorCode: normalized.code,
        errorSummary: normalized.message,
        completedAt: this.now(),
        updatedAt: this.now()
      });
      await this.persistSessionEvidence(operation);
      return operation;
    }
  }

  private evaluatePolicy(input: GitOperationRequest & { id: string }): GitPolicyDecision {
    try {
      return this.options.runner.evaluate(input);
    } catch (error) {
      return { allowed: false, reason: error instanceof Error ? error.message : "Git request failed policy evaluation." };
    }
  }

  private async finalizeRemoteMutationPolicy(input: GitOperationRequest, result: GitOperationResult): Promise<GitOperationResult> {
    if (!result.remoteMutationPolicy) return result;

    const review = await this.resolveReviewedDelivery(input);
    const reviewBlockers = review.blockers;
    const blockers = [...result.remoteMutationPolicy.blockers, ...reviewBlockers];
    const allowed = blockers.length === 0;
    const remoteMutationPolicy: GitRemoteMutationPolicy = {
      ...result.remoteMutationPolicy,
      allowed,
      reason: allowed
        ? `${mutationLabel(result.remoteMutationPolicy.mutationKind)} policy preflight passed with reviewed delivery evidence.`
        : `${mutationLabel(result.remoteMutationPolicy.mutationKind)} policy preflight blocked by ${blockers.length} requirement(s).`,
      reviewedDeliveryPresent: Boolean(review.packet),
      ...(review.packet ? { reviewPacketId: review.packet.id } : {}),
      ...(review.packet?.deliveryArtifactContentId ? { deliveryArtifactContentId: review.packet.deliveryArtifactContentId } : {}),
      blockers
    };
    const isMutationExecution = Boolean(result.branchPush || result.draftPullRequest);
    const policyEvidence = [
      `Mutation: ${remoteMutationPolicy.mutationKind}`,
      `Actor: ${remoteMutationPolicy.actorRoleId}`,
      `Branch: ${remoteMutationPolicy.branchName}`,
      `Commit: ${remoteMutationPolicy.commitSha}`,
      `Remote target: ${remoteMutationPolicy.remoteTarget}`,
      `Permission allowed: ${String(remoteMutationPolicy.permissionAllowed)}`,
      `Reviewed delivery present: ${String(remoteMutationPolicy.reviewedDeliveryPresent)}`,
      ...(remoteMutationPolicy.reviewPacketId ? [`Review packet: ${remoteMutationPolicy.reviewPacketId}`] : []),
      ...(remoteMutationPolicy.deliveryArtifactContentId ? [`Delivery artifact: ${remoteMutationPolicy.deliveryArtifactContentId}`] : []),
      `Force push allowed: ${String(remoteMutationPolicy.forcePushAllowed)}`,
      `Branch deletion allowed: ${String(remoteMutationPolicy.branchDeletionAllowed)}`,
      ...remoteMutationPolicy.blockers.map((blocker) => `Blocker: ${blocker}`)
    ];

    return {
      ...result,
      summary: isMutationExecution ? result.summary : remoteMutationPolicy.reason,
      evidence: isMutationExecution ? [...result.evidence, ...policyEvidence] : policyEvidence,
      remoteMutationPolicy
    };
  }

  private async resolveReviewedDelivery(input: GitOperationRequest): Promise<ReviewedDeliveryEvidence> {
    if (!resultNeedsReviewedDelivery(input.kind)) return { blockers: [], implementationTargets: [] };
    if (!this.options.reviewPacketStore) return { blockers: ["Review packet store is not configured for remote mutation policy."], implementationTargets: [] };
    if (!input.reviewPacketId?.trim()) return { blockers: ["Explicit reviewPacketId is required before remote mutation."], implementationTargets: [] };

    const packet = await this.options.reviewPacketStore.findPacket(input.reviewPacketId);
    if (!packet) return { blockers: ["Review packet was not found."], implementationTargets: [] };
    const blockers = [
      ...(packet.missionId === input.missionId ? [] : ["Review packet belongs to a different mission."]),
      ...(packet.taskId === input.taskId ? [] : ["Review packet belongs to a different task."]),
      ...(packet.status === "delivered" ? [] : [`Review packet status is ${packet.status}; delivered is required.`]),
      ...(packet.deliveryArtifactContentId ? [] : ["Review packet has no delivery artifact content."]),
      ...(packet.ciRun?.status === "passed" ? [] : [`Local CI status is ${packet.ciRun?.status ?? "missing"}; passed is required before remote mutation.`]),
      ...(hasRequiredReviewerApproval(packet) ? [] : ["Required reviewer approvals are missing before remote mutation."])
    ];
    const artifacts = await this.options.artifactStore.readArtifacts();
    const deliveryArtifact = packet.deliveryArtifactContentId
      ? artifacts.find((artifact) => artifact.id === packet.deliveryArtifactContentId)
      : undefined;
    const implementationTargets = await this.collectImplementationPatchTargets(packet, artifacts);

    if (packet.deliveryArtifactContentId && !deliveryArtifact) {
      blockers.push("Delivery artifact content was not found.");
    }

    if (implementationTargets.length === 0) {
      blockers.push("Implementation patch artifact evidence is required before remote mutation.");
    }
    if (!implementationTargets.some((target) => target.targetPath === IMPLEMENTATION_PREVIEW_TARGET_PATH)) {
      blockers.push("Implementation preview manifest evidence is required before remote mutation.");
    }
    if (!implementationTargets.some((target) => target.targetPath.startsWith(IMPLEMENTATION_SURFACE_TARGET_PREFIX))) {
      blockers.push("Implementation surface module evidence is required before remote mutation.");
    }

    return {
      blockers,
      ...(deliveryArtifact ? { deliveryArtifact } : {}),
      implementationTargets,
      packet
    };
  }

  private async collectImplementationPatchTargets(
    packet: ReviewPacket,
    artifacts: readonly RuntimeArtifactContent[]
  ): Promise<ReviewedImplementationTarget[]> {
    const evidenceArtifactIds = new Set(packet.evidence.artifactContentIds);
    const artifactTargets = artifacts
      .filter((artifact) => artifact.missionId === packet.missionId && artifact.taskId === packet.taskId && evidenceArtifactIds.has(artifact.id))
      .map((artifact) => implementationTargetFromArtifact(artifact))
      .filter((target): target is ReviewedImplementationTarget => Boolean(target));

    const callTargets = this.options.toolCallStore
      ? (await this.options.toolCallStore.listToolCalls(packet.missionId))
        .filter((call) => call.taskId === packet.taskId && isImplementationPatchToolCall(call, evidenceArtifactIds))
        .map((call): ReviewedImplementationTarget => ({
          ...(call.artifactContentId ? { artifactContentId: call.artifactContentId } : {}),
          ...(call.artifactRecordId ? { artifactRecordId: call.artifactRecordId } : {}),
          summary: call.result?.summary ?? "Implementation patch file write completed.",
          targetPath: call.targetPath ?? "unknown"
        }))
      : [];

    return uniqueTargets([...callTargets, ...artifactTargets]);
  }

  private attachReviewedDeliveryToDraftPr<T extends GitOperationRequest & { id: string }>(input: T, review: ReviewedDeliveryEvidence): T {
    if (input.kind !== "draft_pr_create" || input.pullRequestBody?.trim()) return input;
    if (!review.packet || !review.deliveryArtifact) return input;

    const body = createDraftPullRequestBody(review).slice(0, 60_000);

    return {
      ...input,
      pullRequestTitle: input.pullRequestTitle?.trim() || `Draft PR: ${review.deliveryArtifact.title}`,
      pullRequestBody: body
    };
  }

  private patchOperation(operation: GitOperationRecord, patch: Partial<GitOperationRecord>): Promise<GitOperationRecord> {
    return this.options.operationStore.upsertOperation({ ...operation, ...patch });
  }

  private async persistGitArtifact(operation: GitOperationRecord, result: GitOperationResult): Promise<RuntimeArtifactContent> {
    const createdAt = this.now();
    const current = await this.options.missionStore.readSession();
    const artifactId = artifactIdForOperation(operation);
    const artifactRecord = createRuntimeArtifactRecord({
      artifactId,
      taskId: operation.taskId,
      title: artifactTitleForOperation(operation),
      summary: result.summary,
      ownerRoleId: operation.roleId,
      gateId: "implementation_gate",
      status: operation.kind === "commit_plan" && result.commitPlan?.ready ? "verified" : "reviewing",
      version: current.artifactRecords.filter((item) => item.artifactId === artifactId).length + 1,
      createdAt
    });
    const sections = sectionsForGitResult(operation, result);
    const artifact: RuntimeArtifactContent = {
      schemaVersion: 1,
      id: `artifact-content-${artifactId}-${operation.id}`,
      artifactRecordId: artifactRecord.id,
      artifactId: artifactRecord.artifactId,
      taskId: artifactRecord.taskId,
      missionId: operation.missionId,
      title: artifactRecord.title,
      summary: artifactRecord.summary,
      ownerRoleId: artifactRecord.ownerRoleId,
      gateId: artifactRecord.gateId,
      status: artifactRecord.status,
      version: artifactRecord.version,
      format: "markdown",
      source: "git_runner",
      sections,
      markdown: formatMarkdown(artifactRecord.title, sections),
      createdAt,
      updatedAt: createdAt
    };
    await this.options.artifactStore.appendArtifact(artifact);
    await this.options.missionStore.writeSession(createRuntimeSessionSnapshot({
      ...current,
      selection: {
        ...current.selection,
        selectedGateId: artifactRecord.gateId,
        selectedRoleId: artifactRecord.ownerRoleId,
        selectedRoomId: "engineering",
        selectedArtifactId: artifactRecord.artifactId
      },
      artifactRecords: [artifactRecord, ...current.artifactRecords].slice(0, 100),
      savedAt: createdAt
    }));
    return artifact;
  }

  private async persistSessionEvidence(operation: GitOperationRecord): Promise<void> {
    const current = await this.options.missionStore.readSession();
    const createdAt = this.now();
    const severity = operation.status === "completed" ? "success" : operation.status === "blocked" || operation.status === "failed" ? "warning" : "info";
    const tone: RuntimeActivityEvent["tone"] = severity === "success" ? "success" : severity === "warning" ? "warning" : "info";
    const audit = createRuntimeAuditEvent({
      id: `audit-git-operation-${operation.id}-${operation.status}`,
      actorRoleId: operation.roleId,
      action: operation.status === "completed" ? "git_operation_completed" : operation.status === "failed" || operation.status === "blocked" ? "git_operation_failed" : "git_operation_started",
      summary: operation.errorSummary ?? operation.result?.summary ?? operation.policy.reason,
      severity,
      entityId: operation.id,
      createdAt
    });
    await this.options.missionStore.writeSession(createRuntimeSessionSnapshot({
      ...current,
      runtime: {
        ...current.runtime,
        activityLog: [{
          id: `evt-git-operation-${operation.id}-${operation.status}`,
          roleId: operation.roleId,
          type: "tool" as const,
          title: titleForStatus(operation),
          summary: operation.errorSummary ?? operation.result?.summary ?? operation.policy.reason,
          tone,
          time: formatTime(createdAt)
        }, ...current.runtime.activityLog].slice(0, 80)
      },
      auditEvents: [audit, ...current.auditEvents].slice(0, 200),
      savedAt: createdAt
    }));
  }
}

function shouldCreateArtifact(operation: GitOperationRecord, result: GitOperationResult): boolean {
  return operation.kind === "diff" || operation.kind === "commit_plan" || operation.kind === "pr_draft" || operation.kind === "local_commit" || operation.kind === "remote_health" || operation.kind === "remote_evidence" || operation.kind === "branch_push_policy" || operation.kind === "draft_pr_policy" || operation.kind === "branch_push" || operation.kind === "draft_pr_create" || Boolean(result.diff?.diff);
}

function hasRequiredReviewerApproval(packet: ReviewPacket): boolean {
  return packet.requiredReviewerRoleIds.length > 0 &&
    packet.requiredReviewerRoleIds.every((roleId) =>
      packet.reviews.some((review) => review.reviewerRoleId === roleId && review.decision === "pass")
    );
}

function isImplementationPatchToolCall(call: ToolCallRecord, evidenceArtifactIds: Set<string>): boolean {
  if (call.kind !== "file_write" || call.status !== "completed" || !call.targetPath) return false;
  if (call.artifactContentId && !evidenceArtifactIds.has(call.artifactContentId)) return false;
  return isImplementationPatchTargetPath(call.targetPath);
}

function implementationTargetFromArtifact(artifact: RuntimeArtifactContent): ReviewedImplementationTarget | undefined {
  if (artifact.source !== "tool_runner" || artifact.title !== "Local Code Patch") return undefined;
  const targetPath = extractToolTargetPath(artifact);
  if (!targetPath || !isImplementationPatchTargetPath(targetPath)) return undefined;
  return {
    artifactContentId: artifact.id,
    artifactRecordId: artifact.artifactRecordId,
    summary: artifact.summary,
    targetPath
  };
}

function extractToolTargetPath(artifact: RuntimeArtifactContent): string | undefined {
  for (const section of artifact.sections) {
    for (const evidence of section.evidence) {
      if (evidence.startsWith("Target: ")) return evidence.slice("Target: ".length).trim();
    }
  }
  return undefined;
}

function isImplementationPatchTargetPath(targetPath: string): boolean {
  return targetPath === IMPLEMENTATION_PREVIEW_TARGET_PATH ||
    (targetPath.startsWith(IMPLEMENTATION_SURFACE_TARGET_PREFIX) && targetPath.endsWith("-surface.ts"));
}

function uniqueTargets(targets: readonly ReviewedImplementationTarget[]): ReviewedImplementationTarget[] {
  const byPath = new Map<string, ReviewedImplementationTarget>();
  for (const target of targets) {
    const previous = byPath.get(target.targetPath);
    const artifactContentId = target.artifactContentId ?? previous?.artifactContentId;
    const artifactRecordId = target.artifactRecordId ?? previous?.artifactRecordId;
    byPath.set(target.targetPath, {
      summary: target.summary,
      targetPath: target.targetPath,
      ...(artifactContentId ? { artifactContentId } : {}),
      ...(artifactRecordId ? { artifactRecordId } : {})
    });
  }
  return [...byPath.values()].sort((left, right) => left.targetPath.localeCompare(right.targetPath));
}

function createDraftPullRequestBody(review: ReviewedDeliveryEvidence): string {
  const packet = review.packet;
  const delivery = review.deliveryArtifact;
  if (!packet || !delivery) return "";

  const previewTargets = review.implementationTargets.filter((target) => target.targetPath === IMPLEMENTATION_PREVIEW_TARGET_PATH);
  const surfaceTargets = review.implementationTargets.filter((target) => target.targetPath.startsWith(IMPLEMENTATION_SURFACE_TARGET_PREFIX));
  const bodySections = [
    delivery.markdown,
    "",
    "## Implementation Patch",
    ...review.implementationTargets.map((target) => formatTargetEvidence(target)),
    "",
    "## Rendered Preview",
    ...(previewTargets.length > 0 ? previewTargets.map((target) => `- Preview manifest: ${target.targetPath}`) : ["- Preview manifest: missing"]),
    ...(surfaceTargets.length > 0 ? surfaceTargets.map((target) => `- Surface module: ${target.targetPath}`) : ["- Surface module: missing"]),
    "",
    "## CI Evidence",
    `- Profile: ${packet.ciRun?.profileId ?? "missing"}`,
    `- Status: ${packet.ciRun?.status ?? "missing"}`,
    ...(packet.ciRun?.commands.map((command) => `- ${command.command}: ${command.status} (${command.toolCallId})`) ?? []),
    "",
    "## Review Evidence",
    ...packet.requiredReviewerRoleIds.map((roleId) => {
      const reviewRecord = packet.reviews.find((item) => item.reviewerRoleId === roleId);
      return `- ${roleId}: ${reviewRecord?.decision ?? "missing"}${reviewRecord ? ` - ${reviewRecord.summary}` : ""}`;
    }),
    "",
    "## Delivery Evidence",
    `- Review packet: ${packet.id}`,
    `- Delivery artifact: ${delivery.id}`,
    "",
    "## Remote Safety",
    "- Draft PR creation only; merge remains a human decision.",
    "- Force push remains disabled.",
    "- Branch deletion remains disabled.",
    "- Deployment and production actions remain disabled."
  ];

  return bodySections.join("\n");
}

function formatTargetEvidence(target: ReviewedImplementationTarget): string {
  const ids = [target.artifactContentId ? `artifact ${target.artifactContentId}` : "", target.artifactRecordId ? `record ${target.artifactRecordId}` : ""]
    .filter(Boolean)
    .join(", ");
  return `- ${target.targetPath}${ids ? ` (${ids})` : ""}: ${target.summary}`;
}

function artifactIdForOperation(operation: GitOperationRecord): string {
  if (operation.kind === "branch_push") return `art-branch-push-${operation.id}`;
  if (operation.kind === "draft_pr_create") return `art-draft-pr-create-${operation.id}`;
  if (operation.kind === "branch_push_policy") return `art-branch-push-policy-${operation.id}`;
  if (operation.kind === "draft_pr_policy") return `art-draft-pr-policy-${operation.id}`;
  if (operation.kind === "remote_evidence") return `art-remote-evidence-${operation.id}`;
  if (operation.kind === "remote_health") return `art-remote-health-${operation.id}`;
  if (operation.kind === "pr_draft") return `art-pr-draft-${operation.id}`;
  if (operation.kind === "local_commit") return `art-local-commit-${operation.id}`;
  if (operation.kind === "commit_plan") return `art-commit-plan-${operation.id}`;
  return `art-git-diff-${operation.id}`;
}

function artifactTitleForOperation(operation: GitOperationRecord): string {
  if (operation.kind === "branch_push") return "Branch Push Evidence";
  if (operation.kind === "draft_pr_create") return "Draft Pull Request Evidence";
  if (operation.kind === "branch_push_policy") return "Branch Push Policy";
  if (operation.kind === "draft_pr_policy") return "Draft PR Policy";
  if (operation.kind === "remote_evidence") return "Remote Publication Evidence";
  if (operation.kind === "remote_health") return "Remote Health Evidence";
  if (operation.kind === "pr_draft") return "Pull Request Draft";
  if (operation.kind === "local_commit") return "Local Commit Evidence";
  if (operation.kind === "commit_plan") return "Git Commit Plan";
  return "Git Diff Evidence";
}

function sectionsForGitResult(operation: GitOperationRecord, result: GitOperationResult): RuntimeArtifactSection[] {
  const sections: RuntimeArtifactSection[] = [
    {
      heading: "Git Operation",
      body: `${operation.kind.replaceAll("_", " ")} executed by ${operation.roleId}.`,
      evidence: result.evidence
    }
  ];
  if (result.worktree) {
    sections.push({
      heading: "Worktree",
      body: result.worktree.summary,
      evidence: [`Branch: ${result.worktree.branch}`, `HEAD: ${result.worktree.headSha}`, `Clean: ${String(result.worktree.isClean)}`]
    });
  }
  if (result.diff) {
    sections.push({
      heading: "Diff Summary",
      body: `${result.diff.changedFiles} file(s), ${result.diff.insertions} insertion(s), ${result.diff.deletions} deletion(s).`,
      evidence: result.diff.files.map((file) => `${file.path}: +${file.insertions}/-${file.deletions}`)
    });
  }
  if (result.commitPlan) {
    sections.push({
      heading: "Commit Plan",
      body: result.commitPlan.summary,
      evidence: [
        `Branch: ${result.commitPlan.branchName}`,
        `Message: ${result.commitPlan.commitMessage}`,
        `Ready: ${String(result.commitPlan.ready)}`,
        ...result.commitPlan.risks
      ]
    });
  }
  if (result.prDraft) {
    sections.push({
      heading: "PR Draft",
      body: result.prDraft.body,
      evidence: [`Title: ${result.prDraft.title}`, `Status: ${result.prDraft.status}`, `Base: ${result.prDraft.baseBranch}`, `Head: ${result.prDraft.headBranch}`]
    });
  }
  if (result.remoteHealth) {
    sections.push({
      heading: "Remote Health",
      body: result.remoteHealth.summary,
      evidence: [
        `Repository: ${result.remoteHealth.repository}`,
        `Remote: ${result.remoteHealth.remoteName}`,
        `Provider: ${result.remoteHealth.provider}`,
        `Default branch: ${result.remoteHealth.defaultBranch}`,
        `Current branch: ${result.remoteHealth.currentBranch}`,
        `Access: ${result.remoteHealth.access}`,
        ...(result.remoteHealth.remoteHeadSha ? [`Remote HEAD: ${result.remoteHealth.remoteHeadSha}`] : []),
        ...(result.remoteHealth.trackingBranch ? [`Tracking: ${result.remoteHealth.trackingBranch}`] : []),
        ...(result.remoteHealth.ahead !== undefined && result.remoteHealth.behind !== undefined ? [`Ahead/behind: ${result.remoteHealth.ahead}/${result.remoteHealth.behind}`] : []),
        ...(result.remoteHealth.githubAuthenticated !== undefined ? [`GitHub auth: ${result.remoteHealth.githubAuthenticated ? "available" : "unavailable"}`] : []),
        ...(result.remoteHealth.githubViewer ? [`GitHub viewer: ${result.remoteHealth.githubViewer}`] : [])
      ]
    });
  }
  if (result.remoteEvidence) {
    sections.push({
      heading: "Remote Publication Evidence",
      body: result.remoteEvidence.summary,
      evidence: [
        `Repository: ${result.remoteEvidence.repository}`,
        `Remote: ${result.remoteEvidence.remoteName}`,
        `Provider: ${result.remoteEvidence.provider}`,
        `Branch: ${result.remoteEvidence.branchName}`,
        `Publication: ${result.remoteEvidence.publicationState}`,
        `Local commit: ${result.remoteEvidence.localCommitSha}`,
        ...(result.remoteEvidence.remoteCommitSha ? [`Remote commit: ${result.remoteEvidence.remoteCommitSha}`] : []),
        `PR: ${result.remoteEvidence.pullRequest.summary}`,
        `Checks: ${result.remoteEvidence.checks.summary}`,
        `Retryable: ${String(result.remoteEvidence.retryable)}`,
        ...(result.remoteEvidence.retryReason ? [`Retry reason: ${result.remoteEvidence.retryReason}`] : []),
        ...result.remoteEvidence.blockedActions.map((item) => `Blocked action: ${item}`)
      ]
    });
  }
  if (result.remoteMutationPolicy) {
    sections.push({
      heading: "Remote Mutation Policy",
      body: result.remoteMutationPolicy.reason,
      evidence: [
        `Mutation: ${result.remoteMutationPolicy.mutationKind}`,
        `Allowed: ${String(result.remoteMutationPolicy.allowed)}`,
        `Actor: ${result.remoteMutationPolicy.actorRoleId}`,
        `Branch: ${result.remoteMutationPolicy.branchName}`,
        `Commit: ${result.remoteMutationPolicy.commitSha}`,
        `Remote target: ${result.remoteMutationPolicy.remoteTarget}`,
        `Base: ${result.remoteMutationPolicy.baseBranch}`,
        `Permission allowed: ${String(result.remoteMutationPolicy.permissionAllowed)}`,
        `Reviewed delivery present: ${String(result.remoteMutationPolicy.reviewedDeliveryPresent)}`,
        ...(result.remoteMutationPolicy.reviewPacketId ? [`Review packet: ${result.remoteMutationPolicy.reviewPacketId}`] : []),
        ...(result.remoteMutationPolicy.deliveryArtifactContentId ? [`Delivery artifact: ${result.remoteMutationPolicy.deliveryArtifactContentId}`] : []),
        `Force push allowed: ${String(result.remoteMutationPolicy.forcePushAllowed)}`,
        `Branch deletion allowed: ${String(result.remoteMutationPolicy.branchDeletionAllowed)}`,
        ...result.remoteMutationPolicy.blockers.map((blocker) => `Blocker: ${blocker}`)
      ]
    });
  }
  if (result.branchPush) {
    sections.push({
      heading: "Branch Push",
      body: result.branchPush.summary,
      evidence: [
        `Remote: ${result.branchPush.remoteName}`,
        `Branch: ${result.branchPush.branchName}`,
        `Commit: ${result.branchPush.commitSha}`,
        `Tracking: ${result.branchPush.trackingBranch}`,
        `Remote target: ${result.branchPush.remoteTarget}`
      ]
    });
  }
  if (result.draftPullRequest) {
    sections.push({
      heading: "Draft Pull Request",
      body: result.draftPullRequest.summary,
      evidence: [
        `URL: ${result.draftPullRequest.url}`,
        ...(result.draftPullRequest.number ? [`Number: ${result.draftPullRequest.number}`] : []),
        `Base: ${result.draftPullRequest.baseBranch}`,
        `Head: ${result.draftPullRequest.headBranch}`,
        `Draft: ${String(result.draftPullRequest.draft)}`
      ]
    });
  }
  if (result.commitSha) {
    sections.push({ heading: "Local Commit", body: `Local commit ${result.commitSha} was created.`, evidence: [`Commit: ${result.commitSha}`] });
  }
  return sections;
}

function titleForStatus(operation: GitOperationRecord): string {
  if (operation.status === "completed") return "Git operation completed";
  if (operation.status === "failed") return "Git operation failed";
  if (operation.status === "blocked") return "Git operation blocked";
  if (operation.status === "running") return "Git operation running";
  return "Git operation queued";
}

function normalizeGitError(error: unknown): { code: GitFailureCode; message: string } {
  if (error instanceof GitExecutionError) return { code: error.code, message: error.message };
  return { code: "io_error", message: error instanceof Error ? error.message : "Unknown Git operation error." };
}

function isPolicyFailure(code: GitFailureCode): boolean {
  return code === "policy_denied" || code === "path_outside_workspace" || code === "secret_path" || code === "commit_disabled" || code === "remote_disabled";
}

function resultNeedsReviewedDelivery(kind: GitOperationRequest["kind"]): boolean {
  return kind === "branch_push_policy" || kind === "draft_pr_policy" || kind === "branch_push" || kind === "draft_pr_create";
}

function requiresReviewedDeliveryBeforeExecution(kind: GitOperationRequest["kind"]): boolean {
  return kind === "branch_push" || kind === "draft_pr_create";
}

function mutationLabel(kind: GitRemoteMutationPolicy["mutationKind"]): string {
  return kind === "branch_push" ? "Branch push" : "Draft PR creation";
}

function errorCodeForPolicy(kind: GitOperationRequest["kind"], reason: string): GitFailureCode {
  if (reason.includes("inside an allowed workspace")) return "path_outside_workspace";
  if (reason.includes("denied")) return "secret_path";
  if (kind === "remote_health" && reason.includes("remote read")) return "remote_disabled";
  if ((kind === "branch_push" || kind === "draft_pr_create") && reason.includes("disabled")) return "remote_disabled";
  if (kind === "local_commit") return "commit_disabled";
  return "policy_denied";
}

function formatMarkdown(title: string, sections: readonly RuntimeArtifactSection[]): string {
  return [`# ${title}`, "", ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body, "", ...section.evidence.map((item) => `- ${item}`), ""])].join("\n").trim();
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
