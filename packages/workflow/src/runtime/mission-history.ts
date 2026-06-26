import type {
  AgentRunEvent,
  AgentRunRecord,
  GitOperationRecord,
  MissionControllerRecord,
  ReviewPacket,
  ToolCallRecord
} from "../../../shared/src/index.js";
import type { RuntimeArtifactContent, RuntimeSessionSnapshot } from "./mission-runtime.js";

export const MISSION_HISTORY_SCHEMA_VERSION = 1;
export const MISSION_HISTORY_STORE_SCHEMA_VERSION = 1;

export type MissionHistoryStatus =
  | "draft"
  | "saved"
  | "running"
  | "blocked"
  | "failed"
  | "cancelled"
  | "delivered";

export type MissionHistoryArchiveReason = "controller_terminal" | "before_retry" | "mission_reset";

export type MissionHistoryRecord = {
  schemaVersion: 1;
  id: string;
  kind: "current" | "archived";
  missionId: string;
  title: string;
  command: string;
  status: MissionHistoryStatus;
  archiveReason?: MissionHistoryArchiveReason;
  controller?: MissionControllerRecord;
  session: RuntimeSessionSnapshot;
  agentRuns: readonly AgentRunRecord[];
  agentRunEvents: readonly AgentRunEvent[];
  toolCalls: readonly ToolCallRecord[];
  gitOperations: readonly GitOperationRecord[];
  reviewPackets: readonly ReviewPacket[];
  artifactContents: readonly RuntimeArtifactContent[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export type MissionHistorySummary = {
  id: string;
  kind: MissionHistoryRecord["kind"];
  missionId: string;
  title: string;
  status: MissionHistoryStatus;
  controllerId?: string;
  attempt?: number;
  currentStage?: MissionControllerRecord["currentStage"];
  agentRunCount: number;
  toolCallCount: number;
  gitOperationCount: number;
  reviewPacketCount: number;
  artifactCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MissionHistoryStoreSnapshot = {
  schemaVersion: 1;
  records: readonly MissionHistoryRecord[];
};

export function createEmptyMissionHistoryStoreSnapshot(): MissionHistoryStoreSnapshot {
  return { schemaVersion: MISSION_HISTORY_STORE_SCHEMA_VERSION, records: [] };
}

export function restoreMissionHistoryStoreSnapshot(value: unknown): MissionHistoryStoreSnapshot {
  if (!value || typeof value !== "object") return createEmptyMissionHistoryStoreSnapshot();
  const snapshot = value as Partial<MissionHistoryStoreSnapshot>;
  if (snapshot.schemaVersion !== MISSION_HISTORY_STORE_SCHEMA_VERSION) return createEmptyMissionHistoryStoreSnapshot();
  return {
    schemaVersion: MISSION_HISTORY_STORE_SCHEMA_VERSION,
    records: Array.isArray(snapshot.records) ? snapshot.records.filter(isMissionHistoryRecord) : []
  };
}

export function createMissionHistorySummary(record: MissionHistoryRecord): MissionHistorySummary {
  return {
    id: record.id,
    kind: record.kind,
    missionId: record.missionId,
    title: record.title,
    status: record.status,
    ...(record.controller ? {
      controllerId: record.controller.id,
      attempt: record.controller.attempt,
      currentStage: record.controller.currentStage
    } : {}),
    agentRunCount: record.agentRuns.length,
    toolCallCount: record.toolCalls.length,
    gitOperationCount: record.gitOperations.length,
    reviewPacketCount: record.reviewPackets.length,
    artifactCount: record.artifactContents.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function isMissionHistoryRecord(value: unknown): value is MissionHistoryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MissionHistoryRecord>;
  return (
    record.schemaVersion === MISSION_HISTORY_SCHEMA_VERSION &&
    typeof record.id === "string" &&
    (record.kind === "current" || record.kind === "archived") &&
    typeof record.missionId === "string" &&
    typeof record.title === "string" &&
    typeof record.command === "string" &&
    ["draft", "saved", "running", "blocked", "failed", "cancelled", "delivered"].includes(record.status ?? "") &&
    Boolean(record.session) &&
    record.session?.schemaVersion === 1 &&
    Array.isArray(record.agentRuns) &&
    Array.isArray(record.agentRunEvents) &&
    Array.isArray(record.toolCalls) &&
    Array.isArray(record.gitOperations) &&
    Array.isArray(record.reviewPackets) &&
    Array.isArray(record.artifactContents) &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}
