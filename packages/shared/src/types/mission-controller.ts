import { ROLE_IDS } from "./roles.js";
import type { AgentProvider, AgentRuntimeMode } from "./agent-runs.js";
import type { ReviewerDecision } from "./reviews.js";
import type { RoleId } from "./roles.js";

const roleIdSet = new Set<string>(ROLE_IDS);

export const MISSION_CONTROLLER_SCHEMA_VERSION = 1;
export const MISSION_CONTROLLER_STORE_SCHEMA_VERSION = 1;

export const MISSION_CONTROLLER_STAGES = [
  "planning",
  "tool_evidence",
  "git_evidence",
  "review_packet",
  "local_ci",
  "reviewers",
  "delivery"
] as const;

export type MissionControllerStage = (typeof MISSION_CONTROLLER_STAGES)[number];
export type MissionControllerStatus = "queued" | "running" | "completed" | "blocked" | "failed" | "cancelled";
export type MissionControllerStageStatus = "running" | "completed" | "blocked" | "failed" | "cancelled";
export type MissionControllerStopCode =
  | "planning_blocked"
  | "tool_failed"
  | "git_policy"
  | "git_not_ready"
  | "ci_failed"
  | "review_revise"
  | "review_blocked"
  | "delivery_not_ready"
  | "cancelled"
  | "unexpected";

export type MissionControllerStageResult = {
  stage: MissionControllerStage;
  status: MissionControllerStageStatus;
  attempt: number;
  summary: string;
  evidenceIds: readonly string[];
  startedAt: string;
  completedAt?: string;
};

export type MissionControllerStopReason = {
  code: MissionControllerStopCode;
  stage: MissionControllerStage;
  message: string;
  evidenceIds: readonly string[];
};

export type LocalReviewerResult = {
  reviewerRoleId: RoleId;
  decision: ReviewerDecision;
  summary: string;
  defects: readonly string[];
  evidenceIds: readonly string[];
  provider: AgentProvider;
  model: string;
  reviewedAt: string;
};

export type MissionControllerRecord = {
  schemaVersion: 1;
  id: string;
  idempotencyKey: string;
  missionId: string;
  taskId: string;
  command: string;
  providerPreference: AgentRuntimeMode;
  status: MissionControllerStatus;
  currentStage: MissionControllerStage;
  attempt: number;
  maxAttempts: number;
  stageResults: readonly MissionControllerStageResult[];
  reviewerResults: readonly LocalReviewerResult[];
  agentRunId?: string;
  reviewPacketId?: string;
  deliveryArtifactContentId?: string;
  stopReason?: MissionControllerStopReason;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
};

export type MissionControllerStartRequest = {
  missionId: string;
  taskId: string;
  command: string;
  idempotencyKey?: string;
  providerPreference?: AgentRuntimeMode;
};

export type MissionControllerStoreSnapshot = {
  schemaVersion: 1;
  controllers: readonly MissionControllerRecord[];
};

export function createEmptyMissionControllerStoreSnapshot(): MissionControllerStoreSnapshot {
  return { schemaVersion: MISSION_CONTROLLER_STORE_SCHEMA_VERSION, controllers: [] };
}

export function restoreMissionControllerStoreSnapshot(value: unknown): MissionControllerStoreSnapshot {
  if (!value || typeof value !== "object") return createEmptyMissionControllerStoreSnapshot();
  const snapshot = value as Partial<MissionControllerStoreSnapshot>;
  if (snapshot.schemaVersion !== MISSION_CONTROLLER_STORE_SCHEMA_VERSION) return createEmptyMissionControllerStoreSnapshot();
  return {
    schemaVersion: MISSION_CONTROLLER_STORE_SCHEMA_VERSION,
    controllers: Array.isArray(snapshot.controllers) ? snapshot.controllers.filter(isMissionControllerRecord) : []
  };
}

export function isMissionControllerStartRequest(value: unknown): value is MissionControllerStartRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<MissionControllerStartRequest>;
  return (
    typeof request.missionId === "string" &&
    typeof request.taskId === "string" &&
    typeof request.command === "string" &&
    (request.idempotencyKey === undefined || typeof request.idempotencyKey === "string") &&
    (request.providerPreference === undefined || ["auto", "ollama", "deterministic"].includes(request.providerPreference))
  );
}

export function isMissionControllerRecord(value: unknown): value is MissionControllerRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MissionControllerRecord>;
  return (
    record.schemaVersion === MISSION_CONTROLLER_SCHEMA_VERSION &&
    typeof record.id === "string" &&
    typeof record.idempotencyKey === "string" &&
    typeof record.missionId === "string" &&
    typeof record.taskId === "string" &&
    typeof record.command === "string" &&
    ["auto", "ollama", "deterministic"].includes(record.providerPreference ?? "") &&
    ["queued", "running", "completed", "blocked", "failed", "cancelled"].includes(record.status ?? "") &&
    (MISSION_CONTROLLER_STAGES as readonly string[]).includes(record.currentStage ?? "") &&
    typeof record.attempt === "number" &&
    typeof record.maxAttempts === "number" &&
    Array.isArray(record.stageResults) &&
    Array.isArray(record.reviewerResults) &&
    record.reviewerResults.every((result) => typeof result.reviewerRoleId === "string" && roleIdSet.has(result.reviewerRoleId)) &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}
