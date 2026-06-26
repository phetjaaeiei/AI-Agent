import type { GitOperationRecord } from "../../../../packages/shared/src/index.js";
import type { RuntimeAuditEvent } from "../../../../packages/workflow/src/index.js";
import { gitOperationSummary } from "./operation-labels.js";

export type RemoteHandoffExecutionStatus = "waiting" | "running" | "skipped" | "completed" | "blocked" | "failed";

export type RemoteHandoffSignalTone = "green" | "amber" | "red" | "blue";

export type RemoteHandoffExecutionEvidence = {
  branchPush: GitOperationRecord | undefined;
  draftPr: GitOperationRecord | undefined;
  latestAudit: RuntimeAuditEvent | undefined;
  status: RemoteHandoffExecutionStatus;
};

export type RemoteHandoffSignalSummary = {
  detail: string;
  tone: RemoteHandoffSignalTone;
  value: string;
};

const handoffAuditActions: readonly RuntimeAuditEvent["action"][] = [
  "automation_handoff_execution_started",
  "automation_handoff_execution_skipped",
  "automation_handoff_execution_completed"
];

export function getRemoteHandoffExecutionEvidence({
  auditEvents,
  gitOperations
}: {
  auditEvents: readonly RuntimeAuditEvent[];
  gitOperations: readonly GitOperationRecord[];
}): RemoteHandoffExecutionEvidence {
  const handoffAudits = auditEvents
    .filter((event) => handoffAuditActions.includes(event.action))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestAudit = handoffAudits[0];
  const branchPush = findLatestGitOperation(gitOperations, "branch_push");
  const draftPr = findLatestGitOperation(gitOperations, "draft_pr_create");

  return {
    branchPush,
    draftPr,
    latestAudit,
    status: remoteHandoffExecutionStatus({ branchPush, draftPr, latestAudit })
  };
}

export function getRemoteHandoffOperationStatus(
  operation: GitOperationRecord | undefined,
  latestAudit: RuntimeAuditEvent | undefined
): RemoteHandoffExecutionStatus {
  if (!operation) return missingOperationStatus(latestAudit);
  return operation.status === "queued" ? "running" : operation.status;
}

export function getRemoteHandoffOperationSummary(
  operation: GitOperationRecord | undefined,
  latestAudit: RuntimeAuditEvent | undefined
): string {
  if (!operation) {
    if (latestAudit?.action === "automation_handoff_execution_skipped") {
      return "No eligible bounded-auto decision was available for this action.";
    }
    if (completedAuditSkippedAction(latestAudit)) {
      return "This action was skipped because a prior remote handoff action did not complete.";
    }
    return "No execution operation has been recorded.";
  }

  return operation.errorSummary ?? gitOperationSummary(operation);
}

function missingOperationStatus(latestAudit: RuntimeAuditEvent | undefined): RemoteHandoffExecutionStatus {
  if (latestAudit?.action === "automation_handoff_execution_skipped") return "skipped";
  if (completedAuditSkippedAction(latestAudit)) return "skipped";
  return "waiting";
}

function completedAuditSkippedAction(latestAudit: RuntimeAuditEvent | undefined): boolean {
  return latestAudit?.action === "automation_handoff_execution_completed" && /\bskipped action\(s\)/i.test(latestAudit.summary);
}

export function createRemoteHandoffSignalSummary({
  auditEvents,
  gitOperations,
  remoteMutationEnabled
}: {
  auditEvents: readonly RuntimeAuditEvent[];
  gitOperations: readonly GitOperationRecord[];
  remoteMutationEnabled: boolean;
}): RemoteHandoffSignalSummary {
  const evidence = getRemoteHandoffExecutionEvidence({ auditEvents, gitOperations });
  const branchCompleted = evidence.branchPush?.status === "completed";
  const draftCompleted = evidence.draftPr?.status === "completed";
  const blocker = evidence.branchPush?.errorSummary ?? evidence.draftPr?.errorSummary;

  if (evidence.status === "completed") {
    return {
      value: "completed",
      detail: branchCompleted && draftCompleted
        ? "Branch pushed, draft PR ready"
        : branchCompleted
          ? "Branch push completed"
          : "Draft PR created",
      tone: "green"
    };
  }

  if (evidence.status === "skipped") {
    return {
      value: "skipped",
      detail: "No eligible bounded-auto handoff",
      tone: "amber"
    };
  }

  if (evidence.status === "running") {
    return {
      value: "running",
      detail: "Remote handoff execution in progress",
      tone: "blue"
    };
  }

  if (evidence.status === "blocked" || evidence.status === "failed") {
    return {
      value: evidence.status,
      detail: blocker ?? "Remote handoff needs attention",
      tone: "red"
    };
  }

  return {
    value: "waiting",
    detail: remoteMutationEnabled ? "Policy checks pending" : "Remote mutation disabled",
    tone: "blue"
  };
}

function findLatestGitOperation(
  operations: readonly GitOperationRecord[],
  kind: "branch_push" | "draft_pr_create"
): GitOperationRecord | undefined {
  return operations
    .filter((operation) => operation.kind === kind)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
}

function remoteHandoffExecutionStatus({
  branchPush,
  draftPr,
  latestAudit
}: {
  branchPush: GitOperationRecord | undefined;
  draftPr: GitOperationRecord | undefined;
  latestAudit: RuntimeAuditEvent | undefined;
}): RemoteHandoffExecutionStatus {
  if (branchPush?.status === "failed" || draftPr?.status === "failed") return "failed";
  if (branchPush?.status === "blocked" || draftPr?.status === "blocked") return "blocked";
  if (branchPush?.status === "running" || draftPr?.status === "running" || latestAudit?.action === "automation_handoff_execution_started") return "running";
  if (branchPush?.status === "completed" || draftPr?.status === "completed") return "completed";
  if (latestAudit?.action === "automation_handoff_execution_skipped") return "skipped";
  return "waiting";
}
