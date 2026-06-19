import { ROLE_IDS } from "./roles.js";
import type { RoleId } from "./roles.js";

const roleIdSet = new Set<string>(ROLE_IDS);

export const TOOL_CALL_SCHEMA_VERSION = 1;
export const TOOL_CALL_STORE_SCHEMA_VERSION = 1;

export const TOOL_CALL_KINDS = ["file_read", "file_write", "shell_command", "test_command"] as const;

export type ToolCallKind = (typeof TOOL_CALL_KINDS)[number];

export type ToolCallStatus = "queued" | "running" | "completed" | "failed" | "blocked" | "cancelled";

export type ToolActionClass = "read" | "draft" | "write_local" | "test";

export type ToolFailureCode =
  | "invalid_request"
  | "policy_denied"
  | "path_outside_workspace"
  | "secret_path"
  | "command_blocked"
  | "timeout"
  | "nonzero_exit"
  | "io_error";

export type ToolPolicySnapshot = {
  schemaVersion: 1;
  workspaceRoot: string;
  allowedWorkspaceRoots: readonly string[];
  allowFileRead: boolean;
  allowFileWrite: boolean;
  allowShellCommand: boolean;
  allowTestCommand: boolean;
  timeoutMs: number;
  maxReadBytes: number;
  maxWriteBytes: number;
  maxOutputBytes: number;
  deniedPathPatterns: readonly string[];
  allowedCommandPrefixes: readonly string[];
};

export type ToolPolicyDecision = {
  allowed: boolean;
  actionClass: ToolActionClass;
  reason: string;
  normalizedTarget?: string;
};

export type ToolCallRequest = {
  missionId: string;
  taskId: string;
  roleId: RoleId;
  kind: ToolCallKind;
  targetPath?: string;
  command?: string;
  content?: string;
  cwd?: string;
};

export type ToolCallResult = {
  summary: string;
  evidence: readonly string[];
  durationMs: number;
  bytesRead?: number;
  bytesWritten?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  beforeHash?: string;
  afterHash?: string;
  patch?: string;
};

export type ToolCallRecord = {
  schemaVersion: 1;
  id: string;
  missionId: string;
  taskId: string;
  roleId: RoleId;
  kind: ToolCallKind;
  status: ToolCallStatus;
  actionClass: ToolActionClass;
  targetPath?: string;
  command?: string;
  cwd?: string;
  policy: ToolPolicyDecision;
  result?: ToolCallResult;
  artifactRecordId?: string;
  artifactContentId?: string;
  errorCode?: ToolFailureCode;
  errorSummary?: string;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
};

export type ToolCallStoreSnapshot = {
  schemaVersion: 1;
  toolCalls: readonly ToolCallRecord[];
};

export function createEmptyToolCallStoreSnapshot(): ToolCallStoreSnapshot {
  return { schemaVersion: TOOL_CALL_STORE_SCHEMA_VERSION, toolCalls: [] };
}

export function restoreToolCallStoreSnapshot(value: unknown): ToolCallStoreSnapshot {
  if (!value || typeof value !== "object") return createEmptyToolCallStoreSnapshot();
  const snapshot = value as Partial<ToolCallStoreSnapshot>;
  if (snapshot.schemaVersion !== TOOL_CALL_STORE_SCHEMA_VERSION) return createEmptyToolCallStoreSnapshot();
  return {
    schemaVersion: TOOL_CALL_STORE_SCHEMA_VERSION,
    toolCalls: Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls.filter(isToolCallRecord) : []
  };
}

export function isToolCallKind(value: unknown): value is ToolCallKind {
  return typeof value === "string" && (TOOL_CALL_KINDS as readonly string[]).includes(value);
}

export function isToolCallRequest(value: unknown): value is ToolCallRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ToolCallRequest>;
  return (
    typeof request.missionId === "string" &&
    typeof request.taskId === "string" &&
    typeof request.roleId === "string" &&
    roleIdSet.has(request.roleId) &&
    isToolCallKind(request.kind) &&
    (request.targetPath === undefined || typeof request.targetPath === "string") &&
    (request.command === undefined || typeof request.command === "string") &&
    (request.content === undefined || typeof request.content === "string") &&
    (request.cwd === undefined || typeof request.cwd === "string")
  );
}

export function isToolCallRecord(value: unknown): value is ToolCallRecord {
  if (!value || typeof value !== "object") return false;
  const call = value as Partial<ToolCallRecord>;
  return (
    call.schemaVersion === TOOL_CALL_SCHEMA_VERSION &&
    typeof call.id === "string" &&
    typeof call.missionId === "string" &&
    typeof call.taskId === "string" &&
    typeof call.roleId === "string" &&
    roleIdSet.has(call.roleId) &&
    isToolCallKind(call.kind) &&
    ["queued", "running", "completed", "failed", "blocked", "cancelled"].includes(call.status ?? "") &&
    ["read", "draft", "write_local", "test"].includes(call.actionClass ?? "") &&
    Boolean(call.policy) &&
    typeof call.policy?.allowed === "boolean" &&
    typeof call.policy?.reason === "string" &&
    typeof call.requestedAt === "string" &&
    typeof call.updatedAt === "string"
  );
}
