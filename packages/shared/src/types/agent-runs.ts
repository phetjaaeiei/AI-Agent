import { ROLE_IDS } from "./roles.js";
import type { RoleId } from "./roles.js";

const roleIdSet = new Set<string>(ROLE_IDS);

export const AGENT_RUN_SCHEMA_VERSION = 1;
export const AGENT_RUN_STORE_SCHEMA_VERSION = 1;

export type AgentProvider = "deterministic" | "ollama";
export type AgentRuntimeMode = "auto" | AgentProvider;
export type AgentRunKind = "planner" | "verifier";
export type AgentRunStatus =
  | "queued"
  | "running"
  | "verifying"
  | "revising"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

export type AgentRunErrorCode =
  | "configuration_missing"
  | "provider_unavailable"
  | "model_missing"
  | "timeout"
  | "cancelled"
  | "invalid_output"
  | "provider_error"
  | "persistence_error";

export type AgentUsage = {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

export type MissionPlanOutput = {
  productGoal: string;
  scopeIn: readonly string[];
  scopeOut: readonly string[];
  userStories: readonly string[];
  acceptanceCriteria: readonly string[];
  assumptions: readonly string[];
  openQuestions: readonly string[];
  risks: readonly { summary: string; ownerRoleId: RoleId; level: "low" | "medium" | "high" }[];
  evidenceRefs: readonly string[];
  confidence: number;
};

export type PlanningVerificationOutput = {
  scores: {
    completeness: number;
    correctness: number;
    consistency: number;
    verifiability: number;
    riskControl: number;
  };
  defects: readonly {
    severity: "low" | "medium" | "high" | "critical";
    summary: string;
    evidence: string;
  }[];
  decision: "pass" | "revise" | "block";
  requiredRevisions: readonly string[];
  confidence: number;
};

export type AgentExecutionRequest = {
  runId: string;
  missionId: string;
  taskId: string;
  kind: AgentRunKind;
  roleId: RoleId;
  command: string;
  attempt: number;
  providerPreference: AgentRuntimeMode;
  plannerOutput?: MissionPlanOutput;
  revisionFeedback?: readonly string[];
};

export type AgentExecutionResult = {
  provider: AgentProvider;
  model: string;
  traceId: string;
  usage: AgentUsage;
  output: MissionPlanOutput | PlanningVerificationOutput;
};

export type AgentRunRecord = {
  schemaVersion: 1;
  id: string;
  idempotencyKey: string;
  missionId: string;
  taskId: string;
  roleId: RoleId;
  verifierRoleId: RoleId;
  status: AgentRunStatus;
  attempt: number;
  provider: AgentProvider;
  model: string;
  command: string;
  inputArtifactIds: readonly string[];
  outputArtifactId?: string;
  traceIds: readonly string[];
  usage: AgentUsage;
  verification?: PlanningVerificationOutput;
  errorCode?: AgentRunErrorCode;
  errorSummary?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentRunEvent = {
  schemaVersion: 1;
  id: string;
  runId: string;
  sequence: number;
  type: "status" | "progress" | "artifact" | "verification" | "error";
  status: AgentRunStatus;
  roleId: RoleId;
  title: string;
  summary: string;
  createdAt: string;
};

export type AgentRunStoreSnapshot = {
  schemaVersion: 1;
  runs: readonly AgentRunRecord[];
  events: readonly AgentRunEvent[];
};

export type AgentRuntimeInfo = {
  configuredMode: AgentRuntimeMode;
  activeProvider: AgentProvider;
  ollamaAvailable: boolean;
  ollamaBaseUrl: string;
  model: string;
  modelAvailable: boolean;
  message: string;
};

export function isMissionPlanOutput(value: unknown): value is MissionPlanOutput {
  if (!value || typeof value !== "object") return false;
  const output = value as Partial<MissionPlanOutput>;
  return (
    typeof output.productGoal === "string" &&
    isStringArray(output.scopeIn) &&
    isStringArray(output.scopeOut) &&
    isStringArray(output.userStories) &&
    isStringArray(output.acceptanceCriteria) &&
    isStringArray(output.assumptions) &&
    isStringArray(output.openQuestions) &&
    Array.isArray(output.risks) &&
    output.risks.every(isMissionRisk) &&
    isStringArray(output.evidenceRefs) &&
    isScore(output.confidence)
  );
}

export function isPlanningVerificationOutput(value: unknown): value is PlanningVerificationOutput {
  if (!value || typeof value !== "object") return false;
  const output = value as Partial<PlanningVerificationOutput>;
  const scores = output.scores;
  return (
    Boolean(scores) &&
    isScore(scores?.completeness) &&
    isScore(scores?.correctness) &&
    isScore(scores?.consistency) &&
    isScore(scores?.verifiability) &&
    isScore(scores?.riskControl) &&
    Array.isArray(output.defects) &&
    output.defects.every(isVerificationDefect) &&
    ["pass", "revise", "block"].includes(output.decision ?? "") &&
    isStringArray(output.requiredRevisions) &&
    isScore(output.confidence)
  );
}

export function restoreAgentRunStoreSnapshot(value: unknown): AgentRunStoreSnapshot {
  if (!value || typeof value !== "object") return createEmptyAgentRunStoreSnapshot();
  const snapshot = value as Partial<AgentRunStoreSnapshot>;
  if (snapshot.schemaVersion !== AGENT_RUN_STORE_SCHEMA_VERSION) return createEmptyAgentRunStoreSnapshot();
  return {
    schemaVersion: AGENT_RUN_STORE_SCHEMA_VERSION,
    runs: Array.isArray(snapshot.runs) ? snapshot.runs.filter(isAgentRunRecord) : [],
    events: Array.isArray(snapshot.events) ? snapshot.events.filter(isAgentRunEvent) : []
  };
}

export function createEmptyAgentRunStoreSnapshot(): AgentRunStoreSnapshot {
  return { schemaVersion: AGENT_RUN_STORE_SCHEMA_VERSION, runs: [], events: [] };
}

function isAgentRunRecord(value: unknown): value is AgentRunRecord {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<AgentRunRecord>;
  return (
    run.schemaVersion === AGENT_RUN_SCHEMA_VERSION &&
    typeof run.id === "string" &&
    typeof run.idempotencyKey === "string" &&
    typeof run.missionId === "string" &&
    typeof run.taskId === "string" &&
    typeof run.roleId === "string" && roleIdSet.has(run.roleId) &&
    typeof run.verifierRoleId === "string" && roleIdSet.has(run.verifierRoleId) &&
    typeof run.command === "string" &&
    ["queued", "running", "verifying", "revising", "completed", "blocked", "failed", "cancelled"].includes(run.status ?? "") &&
    (run.provider === "deterministic" || run.provider === "ollama") &&
    typeof run.model === "string" &&
    typeof run.attempt === "number" &&
    Array.isArray(run.inputArtifactIds) &&
    Array.isArray(run.traceIds) &&
    Boolean(run.usage) &&
    typeof run.createdAt === "string" &&
    typeof run.updatedAt === "string"
  );
}

function isAgentRunEvent(value: unknown): value is AgentRunEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AgentRunEvent>;
  return (
    event.schemaVersion === AGENT_RUN_SCHEMA_VERSION &&
    typeof event.id === "string" &&
    typeof event.runId === "string" &&
    typeof event.sequence === "number" &&
    typeof event.roleId === "string" && roleIdSet.has(event.roleId) &&
    typeof event.title === "string" &&
    typeof event.summary === "string" &&
    typeof event.createdAt === "string"
  );
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isMissionRisk(value: unknown): value is MissionPlanOutput["risks"][number] {
  if (!value || typeof value !== "object") return false;
  const risk = value as Partial<MissionPlanOutput["risks"][number]>;
  return typeof risk.summary === "string" && typeof risk.ownerRoleId === "string" && roleIdSet.has(risk.ownerRoleId) && ["low", "medium", "high"].includes(risk.level ?? "");
}

function isVerificationDefect(value: unknown): value is PlanningVerificationOutput["defects"][number] {
  if (!value || typeof value !== "object") return false;
  const defect = value as Partial<PlanningVerificationOutput["defects"][number]>;
  return (
    ["low", "medium", "high", "critical"].includes(defect.severity ?? "") &&
    typeof defect.summary === "string" &&
    typeof defect.evidence === "string"
  );
}
