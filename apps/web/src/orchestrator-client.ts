import {
  isMissionHistoryRecord,
  restoreRuntimeArtifactContents,
  restoreRuntimeSessionSnapshot
} from "../../../packages/workflow/src/index.js";
import type {
  MissionHistoryRecord,
  MissionHistorySummary,
  RuntimeArtifactContent,
  RuntimeSessionSnapshot
} from "../../../packages/workflow/src/index.js";
import type {
  AgentRunEvent,
  AgentRunRecord,
  AgentRuntimeInfo,
  AgentRuntimeMode,
  GitOperationRecord,
  GitOperationRequest,
  GitPolicySnapshot,
  MissionControllerRecord,
  MissionControllerStartRequest,
  ReviewDecisionRequest,
  ReviewPacket,
  ReviewPacketCreateRequest,
  ToolCallRecord,
  ToolCallRequest,
  ToolPolicySnapshot
} from "../../../packages/shared/src/index.js";

export type OrchestratorConnectionStatus = "checking" | "connected" | "syncing" | "local";

export type OrchestratorAdvanceResult = {
  snapshot: RuntimeSessionSnapshot;
  artifactContent: RuntimeArtifactContent;
  advancedTaskId: string;
  activeRouteId: string;
};

const DEFAULT_ORCHESTRATOR_BASE_URL = "http://127.0.0.1:8787";
const ORCHESTRATOR_URL_STORAGE_KEY = "team-ai-agent:orchestrator-url";
const REQUEST_TIMEOUT_MS = 2200;

export function readOrchestratorBaseUrl(): string {
  if (typeof window === "undefined") {
    return DEFAULT_ORCHESTRATOR_BASE_URL;
  }

  const queryOverride = new URLSearchParams(window.location.search).get("orchestrator");

  if (queryOverride?.trim()) {
    window.localStorage.setItem(ORCHESTRATOR_URL_STORAGE_KEY, queryOverride.trim());
    return trimTrailingSlash(queryOverride.trim());
  }

  return trimTrailingSlash(window.localStorage.getItem(ORCHESTRATOR_URL_STORAGE_KEY) ?? DEFAULT_ORCHESTRATOR_BASE_URL);
}

export async function fetchOrchestratorSession(defaults: RuntimeSessionSnapshot): Promise<RuntimeSessionSnapshot> {
  const payload = await requestJson<unknown>("/api/mission/session");
  return restoreSnapshot(payload, defaults);
}

export async function fetchOrchestratorArtifacts(): Promise<RuntimeArtifactContent[]> {
  const payload = await requestJson<unknown>("/api/mission/artifacts");
  return restoreArtifactContents(payload);
}

export async function fetchAgentRuntimeInfo(): Promise<AgentRuntimeInfo> {
  return validateRuntimeInfo(await requestJson<unknown>("/api/mission/agent-runtime"));
}

export async function fetchAgentRuns(missionId: string): Promise<AgentRunRecord[]> {
  const payload = await requestJson<unknown>(`/api/mission/agent-runs?missionId=${encodeURIComponent(missionId)}`);
  return Array.isArray(payload) ? payload.filter(isAgentRunRecord) : [];
}

export async function fetchToolPolicy(): Promise<ToolPolicySnapshot> {
  return validateToolPolicy(await requestJson<unknown>("/api/mission/tool-policy"));
}

export async function fetchToolCalls(missionId: string): Promise<ToolCallRecord[]> {
  const payload = await requestJson<unknown>(`/api/mission/tool-calls?missionId=${encodeURIComponent(missionId)}`);
  return Array.isArray(payload) ? payload.filter(isToolCallRecord) : [];
}

export async function startToolCall(input: ToolCallRequest): Promise<ToolCallRecord> {
  const payload = await requestJson<unknown>("/api/mission/tool-calls", {
    method: "POST",
    body: JSON.stringify(input)
  });
  if (!isToolCallRecord(payload)) throw new Error("Tool call response is invalid.");
  return payload;
}

export async function fetchGitPolicy(): Promise<GitPolicySnapshot> {
  return validateGitPolicy(await requestJson<unknown>("/api/mission/git-policy"));
}

export async function fetchGitOperations(missionId: string): Promise<GitOperationRecord[]> {
  const payload = await requestJson<unknown>(`/api/mission/git-operations?missionId=${encodeURIComponent(missionId)}`);
  return Array.isArray(payload) ? payload.filter(isGitOperationRecord) : [];
}

export async function startGitOperation(input: GitOperationRequest): Promise<GitOperationRecord> {
  const payload = await requestJson<unknown>("/api/mission/git-operations", {
    method: "POST",
    body: JSON.stringify(input)
  }, 15_000);
  if (!isGitOperationRecord(payload)) throw new Error("Git operation response is invalid.");
  return payload;
}

export async function fetchReviewPackets(missionId: string): Promise<ReviewPacket[]> {
  const payload = await requestJson<unknown>(`/api/mission/review-packets?missionId=${encodeURIComponent(missionId)}`);
  return Array.isArray(payload) ? payload.filter(isReviewPacket) : [];
}

export async function createReviewPacket(input: ReviewPacketCreateRequest): Promise<ReviewPacket> {
  return mutateReviewPacket("/api/mission/review-packets", input, 10_000);
}

export async function refreshReviewPacket(packetId: string): Promise<ReviewPacket> {
  return mutateReviewPacket(`/api/mission/review-packets/${encodeURIComponent(packetId)}/refresh`, undefined, 10_000);
}

export async function runReviewPacketCi(packetId: string): Promise<ReviewPacket> {
  return mutateReviewPacket(`/api/mission/review-packets/${encodeURIComponent(packetId)}/ci`, undefined, 180_000);
}

export async function recordReviewDecision(packetId: string, input: ReviewDecisionRequest): Promise<ReviewPacket> {
  return mutateReviewPacket(`/api/mission/review-packets/${encodeURIComponent(packetId)}/reviews`, input, 10_000);
}

export async function createDeliveryPacket(packetId: string): Promise<ReviewPacket> {
  return mutateReviewPacket(`/api/mission/review-packets/${encodeURIComponent(packetId)}/delivery`, undefined, 10_000);
}

export async function fetchMissionControllers(missionId: string): Promise<MissionControllerRecord[]> {
  const payload = await requestJson<unknown>(`/api/mission/controllers?missionId=${encodeURIComponent(missionId)}`);
  return Array.isArray(payload) ? payload.filter(isMissionControllerRecord) : [];
}

export async function fetchMissionHistory(): Promise<MissionHistorySummary[]> {
  const payload = await requestJson<unknown>("/api/mission/history");
  return Array.isArray(payload) ? payload.filter(isMissionHistorySummary) : [];
}

export async function fetchMissionHistoryRecord(historyId: string): Promise<MissionHistoryRecord> {
  const payload = await requestJson<unknown>(`/api/mission/history/${encodeURIComponent(historyId)}`);
  if (!isMissionHistoryRecord(payload)) throw new Error("Mission history response is invalid.");
  return payload;
}

export async function fetchMissionController(controllerId: string): Promise<MissionControllerRecord> {
  const payload = await requestJson<unknown>(`/api/mission/controllers/${encodeURIComponent(controllerId)}`);
  if (!isMissionControllerRecord(payload)) throw new Error("Mission controller response is invalid.");
  return payload;
}

export async function startMissionController(input: MissionControllerStartRequest): Promise<MissionControllerRecord> {
  return mutateMissionController("/api/mission/controllers", input);
}

export async function cancelMissionController(controllerId: string): Promise<MissionControllerRecord> {
  return mutateMissionController(`/api/mission/controllers/${encodeURIComponent(controllerId)}/cancel`);
}

export async function retryMissionController(controllerId: string): Promise<MissionControllerRecord> {
  return mutateMissionController(`/api/mission/controllers/${encodeURIComponent(controllerId)}/retry`);
}

export async function resumeMissionController(controllerId: string): Promise<MissionControllerRecord> {
  return mutateMissionController(`/api/mission/controllers/${encodeURIComponent(controllerId)}/resume`);
}

export async function fetchAgentRun(runId: string): Promise<AgentRunRecord> {
  const payload = await requestJson<unknown>(`/api/mission/agent-runs/${encodeURIComponent(runId)}`);
  if (!isAgentRunRecord(payload)) throw new Error("Agent run response is invalid.");
  return payload;
}

export async function startAgentRun(input: {
  missionId: string;
  command: string;
  idempotencyKey: string;
  providerPreference?: AgentRuntimeMode;
}): Promise<AgentRunRecord> {
  const payload = await requestJson<unknown>("/api/mission/agent-runs", {
    method: "POST",
    body: JSON.stringify(input)
  });
  if (!isAgentRunRecord(payload)) throw new Error("Agent run start response is invalid.");
  return payload;
}

export async function cancelAgentRun(runId: string): Promise<AgentRunRecord> {
  return mutateAgentRun(runId, "cancel");
}

export async function retryAgentRun(runId: string): Promise<AgentRunRecord> {
  return mutateAgentRun(runId, "retry");
}

export function subscribeToAgentRun(
  runId: string,
  onEvent: (event: AgentRunEvent) => void,
  onConnectionError: () => void
): () => void {
  const source = new EventSource(`${readOrchestratorBaseUrl()}/api/mission/agent-runs/${encodeURIComponent(runId)}/events`);
  source.addEventListener("agent-run", (message) => {
    try {
      const event = JSON.parse((message as MessageEvent<string>).data) as unknown;
      if (isAgentRunEvent(event)) onEvent(event);
    } catch {
      onConnectionError();
    }
  });
  source.onerror = onConnectionError;
  return () => source.close();
}

export async function saveOrchestratorSession(
  snapshot: RuntimeSessionSnapshot,
  defaults: RuntimeSessionSnapshot
): Promise<RuntimeSessionSnapshot> {
  const payload = await requestJson<unknown>("/api/mission/session", {
    method: "PUT",
    body: JSON.stringify(snapshot)
  });

  return restoreSnapshot(payload, defaults);
}

export async function advanceOrchestratorMission(
  commandDraft: string,
  defaults: RuntimeSessionSnapshot
): Promise<OrchestratorAdvanceResult> {
  const payload = await requestJson<unknown>("/api/mission/autopilot", {
    method: "POST",
    body: JSON.stringify({ commandDraft })
  });

  if (!payload || typeof payload !== "object") {
    throw new Error("Orchestrator autopilot response is not an object.");
  }

  const result = payload as Partial<OrchestratorAdvanceResult>;

  if (typeof result.advancedTaskId !== "string" || typeof result.activeRouteId !== "string") {
    throw new Error("Orchestrator autopilot response is missing route metadata.");
  }

  const artifactContents = restoreArtifactContents([result.artifactContent]);

  if (artifactContents.length !== 1) {
    throw new Error("Orchestrator autopilot response is missing artifact content.");
  }

  return {
    snapshot: restoreSnapshot(result.snapshot, defaults),
    artifactContent: artifactContents[0]!,
    advancedTaskId: result.advancedTaskId,
    activeRouteId: result.activeRouteId
  };
}

async function requestJson<T>(path: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${readOrchestratorBaseUrl()}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init.headers
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Orchestrator request failed with ${response.status}.`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Orchestrator request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function mutateReviewPacket(path: string, body: unknown, timeoutMs: number): Promise<ReviewPacket> {
  const payload = await requestJson<unknown>(path, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }, timeoutMs);
  if (!isReviewPacket(payload)) throw new Error("Review packet response is invalid.");
  return payload;
}

async function mutateMissionController(path: string, body?: unknown): Promise<MissionControllerRecord> {
  const payload = await requestJson<unknown>(path, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }, 10_000);
  if (!isMissionControllerRecord(payload)) throw new Error("Mission controller response is invalid.");
  return payload;
}

function restoreSnapshot(payload: unknown, defaults: RuntimeSessionSnapshot): RuntimeSessionSnapshot {
  const restore = restoreRuntimeSessionSnapshot(payload, defaults);

  if (!restore.ok) {
    throw new Error(restore.reason);
  }

  return restore.snapshot;
}

function restoreArtifactContents(payload: unknown): RuntimeArtifactContent[] {
  const contents = restoreRuntimeArtifactContents(payload);

  if (contents.length === 0) {
    throw new Error("Orchestrator artifact content response is invalid.");
  }

  return contents;
}

async function mutateAgentRun(runId: string, action: "cancel" | "retry"): Promise<AgentRunRecord> {
  const payload = await requestJson<unknown>(`/api/mission/agent-runs/${encodeURIComponent(runId)}/${action}`, { method: "POST" });
  if (!isAgentRunRecord(payload)) throw new Error(`Agent run ${action} response is invalid.`);
  return payload;
}

function isAgentRunRecord(value: unknown): value is AgentRunRecord {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<AgentRunRecord>;
  return run.schemaVersion === 1 && typeof run.id === "string" && typeof run.missionId === "string" && typeof run.status === "string" && typeof run.provider === "string";
}

function isToolCallRecord(value: unknown): value is ToolCallRecord {
  if (!value || typeof value !== "object") return false;
  const call = value as Partial<ToolCallRecord>;
  return call.schemaVersion === 1 && typeof call.id === "string" && typeof call.missionId === "string" && typeof call.kind === "string" && typeof call.status === "string";
}

function isGitOperationRecord(value: unknown): value is GitOperationRecord {
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<GitOperationRecord>;
  return operation.schemaVersion === 1 && typeof operation.id === "string" && typeof operation.missionId === "string" && typeof operation.kind === "string" && typeof operation.status === "string";
}

function isReviewPacket(value: unknown): value is ReviewPacket {
  if (!value || typeof value !== "object") return false;
  const packet = value as Partial<ReviewPacket>;
  return packet.schemaVersion === 1 && typeof packet.id === "string" && typeof packet.missionId === "string" && typeof packet.status === "string" && Array.isArray(packet.requirements);
}

function isMissionControllerRecord(value: unknown): value is MissionControllerRecord {
  if (!value || typeof value !== "object") return false;
  const controller = value as Partial<MissionControllerRecord>;
  return controller.schemaVersion === 1 && typeof controller.id === "string" && typeof controller.missionId === "string" && typeof controller.status === "string" && Array.isArray(controller.stageResults);
}

function isMissionHistorySummary(value: unknown): value is MissionHistorySummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<MissionHistorySummary>;
  return (
    typeof summary.id === "string" &&
    (summary.kind === "current" || summary.kind === "archived") &&
    typeof summary.missionId === "string" &&
    typeof summary.title === "string" &&
    typeof summary.status === "string" &&
    typeof summary.agentRunCount === "number" &&
    typeof summary.updatedAt === "string"
  );
}

function isAgentRunEvent(value: unknown): value is AgentRunEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AgentRunEvent>;
  return event.schemaVersion === 1 && typeof event.runId === "string" && typeof event.sequence === "number" && typeof event.title === "string";
}

function validateRuntimeInfo(value: unknown): AgentRuntimeInfo {
  if (!value || typeof value !== "object") throw new Error("Agent runtime response is invalid.");
  const info = value as Partial<AgentRuntimeInfo>;
  if (typeof info.model !== "string" || typeof info.message !== "string" || typeof info.ollamaAvailable !== "boolean" || typeof info.modelAvailable !== "boolean") {
    throw new Error("Agent runtime response is missing required fields.");
  }
  return info as AgentRuntimeInfo;
}

function validateToolPolicy(value: unknown): ToolPolicySnapshot {
  if (!value || typeof value !== "object") throw new Error("Tool policy response is invalid.");
  const policy = value as Partial<ToolPolicySnapshot>;
  if (
    policy.schemaVersion !== 1 ||
    typeof policy.workspaceRoot !== "string" ||
    !Array.isArray(policy.allowedWorkspaceRoots) ||
    typeof policy.allowFileRead !== "boolean" ||
    typeof policy.allowFileWrite !== "boolean" ||
    typeof policy.allowTestCommand !== "boolean"
  ) {
    throw new Error("Tool policy response is missing required fields.");
  }
  return policy as ToolPolicySnapshot;
}

function validateGitPolicy(value: unknown): GitPolicySnapshot {
  if (!value || typeof value !== "object") throw new Error("Git policy response is invalid.");
  const policy = value as Partial<GitPolicySnapshot>;
  if (
    policy.schemaVersion !== 1 ||
    typeof policy.workspaceRoot !== "string" ||
    !Array.isArray(policy.allowedWorkspaceRoots) ||
    typeof policy.allowGitRead !== "boolean" ||
    typeof policy.allowRemoteRead !== "boolean" ||
    typeof policy.allowGitCommit !== "boolean" ||
    typeof policy.allowRemotePush !== "boolean" ||
    typeof policy.allowPullRequestCreate !== "boolean"
  ) {
    throw new Error("Git policy response is missing required fields.");
  }
  return policy as GitPolicySnapshot;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
