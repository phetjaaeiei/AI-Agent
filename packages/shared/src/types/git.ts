import { ROLE_IDS } from "./roles.js";
import type { RoleId } from "./roles.js";

const roleIdSet = new Set<string>(ROLE_IDS);

export const GIT_OPERATION_SCHEMA_VERSION = 1;
export const GIT_OPERATION_STORE_SCHEMA_VERSION = 1;

export const GIT_OPERATION_KINDS = ["status", "diff", "commit_plan", "local_commit", "pr_draft"] as const;

export type GitOperationKind = (typeof GIT_OPERATION_KINDS)[number];

export type GitOperationStatus = "queued" | "running" | "completed" | "failed" | "blocked";

export type GitFailureCode =
  | "invalid_request"
  | "policy_denied"
  | "not_git_repository"
  | "git_unavailable"
  | "secret_path"
  | "path_outside_workspace"
  | "command_failed"
  | "commit_disabled"
  | "remote_disabled"
  | "io_error";

export type GitPolicySnapshot = {
  schemaVersion: 1;
  workspaceRoot: string;
  allowedWorkspaceRoots: readonly string[];
  allowGitRead: boolean;
  allowGitCommit: boolean;
  allowRemotePush: boolean;
  allowPullRequestCreate: boolean;
  timeoutMs: number;
  maxDiffBytes: number;
  deniedPathPatterns: readonly string[];
};

export type GitPolicyDecision = {
  allowed: boolean;
  reason: string;
  normalizedCwd?: string;
};

export type GitFileStatusKind = "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted" | "unknown";

export type GitFileStatus = {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  kind: GitFileStatusKind;
  isDenied: boolean;
};

export type GitDiffStat = {
  path: string;
  insertions: number;
  deletions: number;
  status: GitFileStatusKind;
  isDenied: boolean;
};

export type GitDiffSummary = {
  changedFiles: number;
  insertions: number;
  deletions: number;
  files: readonly GitDiffStat[];
  diff?: string;
  clipped: boolean;
};

export type GitWorktreeRecord = {
  isRepository: boolean;
  branch: string;
  headSha: string;
  isClean: boolean;
  hasDeniedChanges: boolean;
  files: readonly GitFileStatus[];
  summary: string;
  checkedAt: string;
};

export type GitCommitPlanOutput = {
  branchName: string;
  commitMessage: string;
  summary: string;
  changedFiles: readonly string[];
  requiredEvidence: readonly string[];
  risks: readonly string[];
  reviewers: readonly RoleId[];
  ready: boolean;
};

export type GitPullRequestDraft = {
  title: string;
  body: string;
  baseBranch: string;
  headBranch: string;
  changedFiles: readonly string[];
  testEvidence: readonly string[];
  riskSummary: string;
  status: "integration_needed" | "ready_to_create";
};

export type GitOperationRequest = {
  missionId: string;
  taskId: string;
  roleId: RoleId;
  kind: GitOperationKind;
  cwd?: string;
  baseBranch?: string;
  branchName?: string;
  commitMessage?: string;
};

export type GitOperationResult = {
  summary: string;
  evidence: readonly string[];
  durationMs: number;
  worktree?: GitWorktreeRecord;
  diff?: GitDiffSummary;
  commitPlan?: GitCommitPlanOutput;
  prDraft?: GitPullRequestDraft;
  commitSha?: string;
};

export type GitOperationRecord = {
  schemaVersion: 1;
  id: string;
  missionId: string;
  taskId: string;
  roleId: RoleId;
  kind: GitOperationKind;
  status: GitOperationStatus;
  cwd?: string;
  policy: GitPolicyDecision;
  result?: GitOperationResult;
  artifactRecordId?: string;
  artifactContentId?: string;
  errorCode?: GitFailureCode;
  errorSummary?: string;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
};

export type GitOperationStoreSnapshot = {
  schemaVersion: 1;
  operations: readonly GitOperationRecord[];
};

export function createEmptyGitOperationStoreSnapshot(): GitOperationStoreSnapshot {
  return { schemaVersion: GIT_OPERATION_STORE_SCHEMA_VERSION, operations: [] };
}

export function restoreGitOperationStoreSnapshot(value: unknown): GitOperationStoreSnapshot {
  if (!value || typeof value !== "object") return createEmptyGitOperationStoreSnapshot();
  const snapshot = value as Partial<GitOperationStoreSnapshot>;
  if (snapshot.schemaVersion !== GIT_OPERATION_STORE_SCHEMA_VERSION) return createEmptyGitOperationStoreSnapshot();
  return {
    schemaVersion: GIT_OPERATION_STORE_SCHEMA_VERSION,
    operations: Array.isArray(snapshot.operations) ? snapshot.operations.filter(isGitOperationRecord) : []
  };
}

export function isGitOperationKind(value: unknown): value is GitOperationKind {
  return typeof value === "string" && (GIT_OPERATION_KINDS as readonly string[]).includes(value);
}

export function isGitOperationRequest(value: unknown): value is GitOperationRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<GitOperationRequest>;
  return (
    typeof request.missionId === "string" &&
    typeof request.taskId === "string" &&
    typeof request.roleId === "string" &&
    roleIdSet.has(request.roleId) &&
    isGitOperationKind(request.kind) &&
    (request.cwd === undefined || typeof request.cwd === "string") &&
    (request.baseBranch === undefined || typeof request.baseBranch === "string") &&
    (request.branchName === undefined || typeof request.branchName === "string") &&
    (request.commitMessage === undefined || typeof request.commitMessage === "string")
  );
}

export function isGitOperationRecord(value: unknown): value is GitOperationRecord {
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<GitOperationRecord>;
  return (
    operation.schemaVersion === GIT_OPERATION_SCHEMA_VERSION &&
    typeof operation.id === "string" &&
    typeof operation.missionId === "string" &&
    typeof operation.taskId === "string" &&
    typeof operation.roleId === "string" &&
    roleIdSet.has(operation.roleId) &&
    isGitOperationKind(operation.kind) &&
    ["queued", "running", "completed", "failed", "blocked"].includes(operation.status ?? "") &&
    Boolean(operation.policy) &&
    typeof operation.policy?.allowed === "boolean" &&
    typeof operation.policy?.reason === "string" &&
    typeof operation.requestedAt === "string" &&
    typeof operation.updatedAt === "string"
  );
}
