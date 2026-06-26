import type { GitOperationRecord, ToolCallRecord } from "../../../../packages/shared/src/index.js";

export const toolCallKindLabel: Record<ToolCallRecord["kind"], string> = {
  file_read: "File read",
  file_write: "File write",
  shell_command: "Shell",
  test_command: "Test"
};

export const gitOperationKindLabel: Record<GitOperationRecord["kind"], string> = {
  status: "Status",
  diff: "Diff",
  commit_plan: "Commit plan",
  local_commit: "Local commit",
  pr_draft: "PR draft",
  remote_health: "Remote health",
  remote_evidence: "Remote evidence",
  branch_push_policy: "Push policy",
  draft_pr_policy: "PR policy",
  branch_push: "Branch push",
  draft_pr_create: "Draft PR create"
};

export function gitOperationSummary(operation: GitOperationRecord): string {
  if (operation.errorSummary) return operation.errorSummary;
  if (operation.result?.draftPullRequest) return operation.result.draftPullRequest.url;
  if (operation.result?.branchPush) return `${operation.result.branchPush.branchName} pushed`;
  if (operation.result?.remoteEvidence) {
    const evidence = operation.result.remoteEvidence;
    return `${evidence.publicationState.replaceAll("_", " ")}; ${evidence.pullRequest.state === "none" ? "no PR" : evidence.pullRequest.state}`;
  }
  if (operation.result?.remoteMutationPolicy) {
    const policy = operation.result.remoteMutationPolicy;
    return policy.allowed ? `${policy.branchName} ready` : `${policy.blockers.length} blockers`;
  }
  if (operation.result?.remoteHealth) {
    const health = operation.result.remoteHealth;
    return health.access === "ok" ? `${health.repository} reachable` : health.access.replaceAll("_", " ");
  }
  if (operation.result?.commitPlan) {
    return operation.result.commitPlan.ready
      ? `${operation.result.commitPlan.changedFiles.length} files ready`
      : "Plan blocked";
  }
  if (operation.result?.prDraft) return operation.result.prDraft.status.replaceAll("_", " ");
  if (operation.result?.worktree) {
    return operation.result.worktree.isClean ? `${operation.result.worktree.branch} clean` : `${operation.result.worktree.files.length} changed files`;
  }
  return operation.result?.summary ?? operation.policy.reason;
}
