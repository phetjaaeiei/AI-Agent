import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRuntimeSessionSnapshot, restoreRuntimeSessionSnapshot } from "../../../packages/workflow/src/index.js";
import {
  OllamaAgentExecutor,
  OllamaReviewExecutor,
  ResilientAgentExecutor,
  ResilientReviewExecutor
} from "../../../packages/agent-core/src/index.js";
import {
  createDefaultAutomationPolicySnapshot,
  isGitOperationRequest,
  isMissionControllerStartRequest,
  isReviewDecisionRequest,
  isReviewPacketCreateRequest,
  isToolCallRequest
} from "../../../packages/shared/src/index.js";
import type { AgentRuntimeMode } from "../../../packages/shared/src/index.js";
import { LocalGitRunner } from "../../../packages/git-runner/src/index.js";
import { LocalToolRunner } from "../../../packages/tool-runner/src/index.js";
import { AgentRunEventBroker } from "./agent-run-events.js";
import { AgentRunService } from "./agent-run-service.js";
import { FileAgentRunStore } from "./agent-run-store.js";
import type { AgentRunStore } from "./agent-run-store.js";
import { FileArtifactContentStore } from "./artifact-content-store.js";
import type { ArtifactContentStore } from "./artifact-content-store.js";
import { createDefaultOrchestratorArtifactContents, createDefaultOrchestratorSession } from "./fixtures.js";
import { FileMissionStore } from "./mission-store.js";
import type { MissionStore } from "./mission-store.js";
import { advanceStoredMission } from "./orchestrator.js";
import { GitOperationService } from "./git-operation-service.js";
import { FileGitOperationStore } from "./git-operation-store.js";
import type { GitOperationStore } from "./git-operation-store.js";
import { ToolCallService } from "./tool-call-service.js";
import { FileToolCallStore } from "./tool-call-store.js";
import type { ToolCallStore } from "./tool-call-store.js";
import { ReviewPacketService } from "./review-packet-service.js";
import { FileReviewPacketStore } from "./review-packet-store.js";
import type { ReviewPacketStore } from "./review-packet-store.js";
import { MissionControllerService } from "./mission-controller-service.js";
import { FileMissionControllerStore } from "./mission-controller-store.js";
import type { MissionControllerStore } from "./mission-controller-store.js";
import { MissionHistoryService } from "./mission-history-service.js";
import { FileMissionHistoryStore } from "./mission-history-store.js";

type ServerOptions = {
  store: MissionStore;
  artifactStore: ArtifactContentStore;
  runService?: AgentRunService;
  runStore?: AgentRunStore;
  toolCallService?: ToolCallService;
  toolCallStore?: ToolCallStore;
  gitOperationService?: GitOperationService;
  gitOperationStore?: GitOperationStore;
  reviewPacketService?: ReviewPacketService;
  reviewPacketStore?: ReviewPacketStore;
  missionControllerService?: MissionControllerService;
  missionControllerStore?: MissionControllerStore;
  missionHistoryService?: MissionHistoryService;
  now?: () => string;
};

export function createOrchestratorServer({
  store,
  artifactStore,
  runService,
  runStore,
  toolCallService,
  toolCallStore,
  gitOperationService,
  gitOperationStore,
  reviewPacketService,
  reviewPacketStore,
  missionControllerService,
  missionControllerStore,
  missionHistoryService,
  now = () => new Date().toISOString()
}: ServerOptions): Server {
  return createServer(async (request, response) => {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          status: "ok",
          service: "team-ai-agent-orchestrator",
          ...(runService ? { agentRuntime: await runService.getRuntimeInfo() } : {})
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/agent-runtime") {
        if (!runService) return sendJson(response, 503, { error: "Agent runtime is not configured." });
        sendJson(response, 200, await runService.getRuntimeInfo());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/agent-runs") {
        if (!runService) return sendJson(response, 503, { error: "Agent runtime is not configured." });
        sendJson(response, 200, await runService.listRuns(url.searchParams.get("missionId") ?? undefined));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/tool-policy") {
        if (!toolCallService) return sendJson(response, 503, { error: "Tool runner is not configured." });
        sendJson(response, 200, toolCallService.getPolicy());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/git-policy") {
        if (!gitOperationService) return sendJson(response, 503, { error: "Git runner is not configured." });
        sendJson(response, 200, gitOperationService.getPolicy());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/automation-policy") {
        sendJson(response, 200, createDefaultAutomationPolicySnapshot(now()));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/tool-calls") {
        if (!toolCallService) return sendJson(response, 503, { error: "Tool runner is not configured." });
        sendJson(response, 200, await toolCallService.listToolCalls(url.searchParams.get("missionId") ?? undefined));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/mission/tool-calls") {
        if (!toolCallService) return sendJson(response, 503, { error: "Tool runner is not configured." });
        const body = await readJsonBody(request);
        if (!isToolCallRequest(body)) return sendJson(response, 400, { error: "Tool call request is invalid." });
        sendJson(response, 202, await toolCallService.executeToolCall(body));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/git-operations") {
        if (!gitOperationService) return sendJson(response, 503, { error: "Git runner is not configured." });
        sendJson(response, 200, await gitOperationService.listOperations(url.searchParams.get("missionId") ?? undefined));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/mission/git-operations") {
        if (!gitOperationService) return sendJson(response, 503, { error: "Git runner is not configured." });
        const body = await readJsonBody(request);
        if (!isGitOperationRequest(body)) return sendJson(response, 400, { error: "Git operation request is invalid." });
        sendJson(response, 202, await gitOperationService.executeOperation(body));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/review-packets") {
        if (!reviewPacketService) return sendJson(response, 503, { error: "Review packet service is not configured." });
        sendJson(response, 200, await reviewPacketService.listPackets(url.searchParams.get("missionId") ?? undefined));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/mission/review-packets") {
        if (!reviewPacketService) return sendJson(response, 503, { error: "Review packet service is not configured." });
        const body = await readJsonBody(request);
        if (!isReviewPacketCreateRequest(body)) return sendJson(response, 400, { error: "Review packet request is invalid." });
        sendJson(response, 201, await reviewPacketService.createPacket(body));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/controllers") {
        if (!missionControllerService) return sendJson(response, 503, { error: "Mission controller is not configured." });
        sendJson(response, 200, await missionControllerService.listControllers(url.searchParams.get("missionId") ?? undefined));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/history") {
        if (!missionHistoryService) return sendJson(response, 503, { error: "Mission history is not configured." });
        sendJson(response, 200, await missionHistoryService.listHistory());
        return;
      }

      const missionHistoryMatch = url.pathname.match(/^\/api\/mission\/history\/([^/]+)$/);
      if (missionHistoryMatch && request.method === "GET") {
        if (!missionHistoryService) return sendJson(response, 503, { error: "Mission history is not configured." });
        const historyId = decodeURIComponent(missionHistoryMatch[1]!);
        const history = await missionHistoryService.getHistory(historyId);
        sendJson(response, history ? 200 : 404, history ?? { error: "Mission history record not found." });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/mission/controllers") {
        if (!missionControllerService) return sendJson(response, 503, { error: "Mission controller is not configured." });
        const body = await readJsonBody(request);
        if (!isMissionControllerStartRequest(body)) return sendJson(response, 400, { error: "Mission controller request is invalid." });
        sendJson(response, 202, await missionControllerService.startController(body));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/mission/agent-runs") {
        if (!runService) return sendJson(response, 503, { error: "Agent runtime is not configured." });
        const body = await readJsonBody(request);
        if (!body || typeof body !== "object") return sendJson(response, 400, { error: "Request body is required." });
        const input = body as Record<string, unknown>;
        if (typeof input.missionId !== "string" || typeof input.command !== "string") {
          return sendJson(response, 400, { error: "missionId and command are required." });
        }
        const providerPreference = isAgentRuntimeMode(input.providerPreference) ? input.providerPreference : undefined;
        const run = await runService.startRun({
          missionId: input.missionId,
          command: input.command,
          ...(typeof input.taskId === "string" ? { taskId: input.taskId } : {}),
          ...(typeof input.idempotencyKey === "string" ? { idempotencyKey: input.idempotencyKey } : {}),
          ...(providerPreference ? { providerPreference } : {})
        });
        sendJson(response, 202, run);
        return;
      }

      const agentRunMatch = url.pathname.match(/^\/api\/mission\/agent-runs\/([^/]+)(?:\/(events|cancel|retry))?$/);
      if (agentRunMatch && runService) {
        const runId = decodeURIComponent(agentRunMatch[1]!);
        const action = agentRunMatch[2];
        if (request.method === "GET" && action === "events") {
          const run = await runService.getRun(runId);
          if (!run) return sendJson(response, 404, { error: "Agent run not found." });
          await streamAgentRunEvents(request, response, runService, runId);
          return;
        }
        if (request.method === "POST" && action === "cancel") {
          const run = await runService.cancelRun(runId);
          sendJson(response, run ? 200 : 404, run ?? { error: "Agent run not found." });
          return;
        }
        if (request.method === "POST" && action === "retry") {
          sendJson(response, 202, await runService.retryRun(runId));
          return;
        }
        if (request.method === "GET" && !action) {
          const run = await runService.getRun(runId);
          sendJson(response, run ? 200 : 404, run ?? { error: "Agent run not found." });
          return;
        }
      }

      const toolCallMatch = url.pathname.match(/^\/api\/mission\/tool-calls\/([^/]+)$/);
      if (toolCallMatch && toolCallService && request.method === "GET") {
        const toolCallId = decodeURIComponent(toolCallMatch[1]!);
        const toolCall = await toolCallService.getToolCall(toolCallId);
        sendJson(response, toolCall ? 200 : 404, toolCall ?? { error: "Tool call not found." });
        return;
      }

      const gitOperationMatch = url.pathname.match(/^\/api\/mission\/git-operations\/([^/]+)$/);
      if (gitOperationMatch && gitOperationService && request.method === "GET") {
        const operationId = decodeURIComponent(gitOperationMatch[1]!);
        const operation = await gitOperationService.getOperation(operationId);
        sendJson(response, operation ? 200 : 404, operation ?? { error: "Git operation not found." });
        return;
      }

      const reviewPacketMatch = url.pathname.match(/^\/api\/mission\/review-packets\/([^/]+)(?:\/(refresh|ci|reviews|delivery))?$/);
      if (reviewPacketMatch && reviewPacketService) {
        const packetId = decodeURIComponent(reviewPacketMatch[1]!);
        const action = reviewPacketMatch[2];
        if (request.method === "GET" && !action) {
          const packet = await reviewPacketService.getPacket(packetId);
          sendJson(response, packet ? 200 : 404, packet ?? { error: "Review packet not found." });
          return;
        }
        if (request.method === "POST" && action === "refresh") {
          sendJson(response, 200, await reviewPacketService.refreshPacket(packetId));
          return;
        }
        if (request.method === "POST" && action === "ci") {
          sendJson(response, 200, await reviewPacketService.runLocalCi(packetId));
          return;
        }
        if (request.method === "POST" && action === "reviews") {
          const body = await readJsonBody(request);
          if (!isReviewDecisionRequest(body)) return sendJson(response, 400, { error: "Review decision request is invalid." });
          sendJson(response, 200, await reviewPacketService.recordDecision(packetId, body));
          return;
        }
        if (request.method === "POST" && action === "delivery") {
          sendJson(response, 200, await reviewPacketService.createDeliveryPacket(packetId));
          return;
        }
      }

      const controllerMatch = url.pathname.match(/^\/api\/mission\/controllers\/([^/]+)(?:\/(cancel|retry|resume))?$/);
      if (controllerMatch && missionControllerService) {
        const controllerId = decodeURIComponent(controllerMatch[1]!);
        const action = controllerMatch[2];
        if (request.method === "GET" && !action) {
          const controller = await missionControllerService.getController(controllerId);
          sendJson(response, controller ? 200 : 404, controller ?? { error: "Mission controller not found." });
          return;
        }
        if (request.method === "POST" && action === "cancel") {
          sendJson(response, 200, await missionControllerService.cancelController(controllerId));
          return;
        }
        if (request.method === "POST" && action === "retry") {
          sendJson(response, 202, await missionControllerService.retryController(controllerId));
          return;
        }
        if (request.method === "POST" && action === "resume") {
          sendJson(response, 202, await missionControllerService.resumeController(controllerId));
          return;
        }
      }

      if (request.method === "GET" && url.pathname === "/api/mission/session") {
        sendJson(response, 200, await store.readSession());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mission/artifacts") {
        sendJson(response, 200, await artifactStore.readArtifacts());
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/mission/artifacts/")) {
        const artifactContentId = decodeURIComponent(url.pathname.replace("/api/mission/artifacts/", ""));
        const artifactContent = (await artifactStore.readArtifacts()).find(
          (item) => item.id === artifactContentId || item.artifactRecordId === artifactContentId
        );

        if (!artifactContent) {
          sendJson(response, 404, { error: "Artifact content not found" });
          return;
        }

        sendJson(response, 200, artifactContent);
        return;
      }

      if (request.method === "PUT" && url.pathname === "/api/mission/session") {
        const body = await readJsonBody(request);
        const defaults = createDefaultOrchestratorSession(now());
        const restore = restoreRuntimeSessionSnapshot(body, defaults);

        if (!restore.ok) {
          sendJson(response, 400, { error: restore.reason });
          return;
        }

        const snapshot = createRuntimeSessionSnapshot({
          ...restore.snapshot,
          savedAt: now()
        });

        sendJson(response, 200, await store.writeSession(snapshot));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/mission/autopilot") {
        const body = await readJsonBody(request);
        const commandDraft =
          body && typeof body === "object" && "commandDraft" in body && typeof body.commandDraft === "string"
            ? body.commandDraft
            : undefined;
        const result = await advanceStoredMission(store, artifactStore, commandDraft ? { commandDraft } : {}, now);

        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/mission/reset") {
        if (missionControllerService) {
          const activeControllers = (await missionControllerService.listControllers()).filter((item) => item.status === "queued" || item.status === "running");
          await Promise.all(activeControllers.map((item) => missionControllerService.cancelController(item.id)));
        }
        await missionHistoryService?.captureCurrent("mission_reset");
        const snapshot = await store.resetSession();
        await artifactStore.resetArtifacts();
        await runStore?.reset();
        await toolCallStore?.reset();
        await gitOperationStore?.reset();
        await reviewPacketStore?.reset();
        await missionControllerStore?.reset();
        sendJson(response, 200, snapshot);
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown orchestrator error" });
    }
  });
}

export function createDefaultFileMissionStore(): FileMissionStore {
  const storagePath = process.env.TEAM_AI_AGENT_STORE_PATH ?? resolve(process.cwd(), ".data", "mission-session.json");
  return new FileMissionStore(storagePath, () => createDefaultOrchestratorSession());
}

export function createDefaultFileArtifactContentStore(): FileArtifactContentStore {
  const storagePath = process.env.TEAM_AI_AGENT_ARTIFACT_STORE_PATH ?? resolve(process.cwd(), ".data", "mission-artifacts.json");
  return new FileArtifactContentStore(storagePath, () => createDefaultOrchestratorArtifactContents());
}

export function createDefaultFileAgentRunStore(): FileAgentRunStore {
  const storagePath = process.env.TEAM_AI_AGENT_RUN_STORE_PATH ?? resolve(process.cwd(), ".data", "agent-runs.json");
  return new FileAgentRunStore(storagePath);
}

export function createDefaultFileToolCallStore(): FileToolCallStore {
  const storagePath = process.env.TEAM_AI_AGENT_TOOL_CALL_STORE_PATH ?? resolve(process.cwd(), ".data", "tool-calls.json");
  return new FileToolCallStore(storagePath);
}

export function createDefaultFileGitOperationStore(): FileGitOperationStore {
  const storagePath = process.env.TEAM_AI_AGENT_GIT_OPERATION_STORE_PATH ?? resolve(process.cwd(), ".data", "git-operations.json");
  return new FileGitOperationStore(storagePath);
}

export function createDefaultFileReviewPacketStore(): FileReviewPacketStore {
  const storagePath = process.env.TEAM_AI_AGENT_REVIEW_PACKET_STORE_PATH ?? resolve(process.cwd(), ".data", "review-packets.json");
  return new FileReviewPacketStore(storagePath);
}

export function createDefaultFileMissionControllerStore(): FileMissionControllerStore {
  const storagePath = process.env.TEAM_AI_AGENT_CONTROLLER_STORE_PATH ?? resolve(process.cwd(), ".data", "mission-controllers.json");
  return new FileMissionControllerStore(storagePath);
}

export function createDefaultFileMissionHistoryStore(): FileMissionHistoryStore {
  const storagePath = process.env.TEAM_AI_AGENT_HISTORY_STORE_PATH ?? resolve(process.cwd(), ".data", "mission-history.json");
  return new FileMissionHistoryStore(storagePath);
}

export function createDefaultAgentRunService(
  store: MissionStore,
  artifactStore: ArtifactContentStore,
  runStore: AgentRunStore,
  eventBroker = new AgentRunEventBroker()
): AgentRunService {
  const configuredMode = parseRuntimeMode(process.env.AGENT_RUNTIME_MODE);
  const ollama = new OllamaAgentExecutor({
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    model: process.env.OLLAMA_MODEL ?? "qwen3:8b"
  });
  const executor = new ResilientAgentExecutor(configuredMode, ollama);
  return new AgentRunService({
    executor,
    runtimeInfo: () => executor.getRuntimeInfo(),
    runStore,
    missionStore: store,
    artifactStore,
    eventBroker
  });
}

export function createDefaultToolCallService(
  store: MissionStore,
  artifactStore: ArtifactContentStore,
  toolCallStore: ToolCallStore
): ToolCallService {
  const runner = new LocalToolRunner({
    workspaceRoot: process.env.TEAM_AI_AGENT_WORKSPACE_ROOT ?? process.cwd(),
    allowFileRead: process.env.TEAM_AI_AGENT_ALLOW_FILE_READ !== "false",
    allowFileWrite: process.env.TEAM_AI_AGENT_ALLOW_FILE_WRITE !== "false",
    allowShellCommand: process.env.TEAM_AI_AGENT_ALLOW_SHELL !== "false",
    allowTestCommand: process.env.TEAM_AI_AGENT_ALLOW_TEST_COMMAND !== "false",
    timeoutMs: Number(process.env.TEAM_AI_AGENT_TOOL_TIMEOUT_MS ?? 30_000)
  });
  return new ToolCallService({
    runner,
    toolCallStore,
    missionStore: store,
    artifactStore
  });
}

export function createDefaultGitOperationService(
  store: MissionStore,
  artifactStore: ArtifactContentStore,
  gitOperationStore: GitOperationStore,
  reviewPacketStore?: ReviewPacketStore
): GitOperationService {
  const runner = new LocalGitRunner({
    workspaceRoot: process.env.TEAM_AI_AGENT_WORKSPACE_ROOT ?? process.cwd(),
    allowGitRead: process.env.TEAM_AI_AGENT_ALLOW_GIT_READ !== "false",
    allowRemoteRead: process.env.TEAM_AI_AGENT_ALLOW_GIT_REMOTE_READ !== "false",
    allowGitCommit: process.env.TEAM_AI_AGENT_ALLOW_GIT_COMMIT === "true",
    allowRemotePush: process.env.TEAM_AI_AGENT_ALLOW_GIT_PUSH === "true",
    allowPullRequestCreate: process.env.TEAM_AI_AGENT_ALLOW_PR_CREATE === "true",
    timeoutMs: Number(process.env.TEAM_AI_AGENT_GIT_TIMEOUT_MS ?? 30_000),
    maxDiffBytes: Number(process.env.TEAM_AI_AGENT_GIT_MAX_DIFF_BYTES ?? 80_000)
  });
  return new GitOperationService({
    runner,
    operationStore: gitOperationStore,
    missionStore: store,
    artifactStore,
    ...(reviewPacketStore ? { reviewPacketStore } : {})
  });
}

export function createDefaultReviewPacketService(
  store: MissionStore,
  artifactStore: ArtifactContentStore,
  toolCallStore: ToolCallStore,
  gitOperationStore: GitOperationStore,
  reviewPacketStore: ReviewPacketStore,
  toolCallService: ToolCallService
): ReviewPacketService {
  return new ReviewPacketService({
    packetStore: reviewPacketStore,
    missionStore: store,
    artifactStore,
    toolCallStore,
    gitOperationStore,
    toolCallService
  });
}

export function createDefaultMissionControllerService(
  controllerStore: MissionControllerStore,
  store: MissionStore,
  agentRunService: AgentRunService,
  toolCallService: ToolCallService,
  gitOperationService: GitOperationService,
  reviewPacketService: ReviewPacketService,
  historyRecorder?: MissionHistoryService
): MissionControllerService {
  const configuredMode = parseRuntimeMode(process.env.AGENT_RUNTIME_MODE);
  const reviewer = new ResilientReviewExecutor(
    configuredMode,
    new OllamaReviewExecutor({
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      model: process.env.OLLAMA_MODEL ?? "qwen3:8b"
    })
  );
  return new MissionControllerService({
    controllerStore,
    missionStore: store,
    agentRunService,
    toolCallService,
    gitOperationService,
    reviewPacketService,
    reviewer,
    ...(historyRecorder ? { historyRecorder } : {})
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(statusCode === 204 ? "" : JSON.stringify(payload));
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,PUT,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

async function streamAgentRunEvents(
  request: IncomingMessage,
  response: ServerResponse,
  runService: AgentRunService,
  runId: string
): Promise<void> {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  const writeEvent = (event: Awaited<ReturnType<AgentRunService["getEvents"]>>[number]) => {
    response.write(`id: ${event.sequence}\nevent: agent-run\ndata: ${JSON.stringify(event)}\n\n`);
  };
  for (const event of await runService.getEvents(runId)) writeEvent(event);
  const unsubscribe = runService.subscribe(runId, writeEvent);
  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
  await new Promise<void>((resolveStream) => {
    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      resolveStream();
    });
  });
}

function parseRuntimeMode(value: string | undefined): AgentRuntimeMode {
  return value === "deterministic" || value === "ollama" || value === "auto" ? value : "auto";
}

function isAgentRuntimeMode(value: unknown): value is AgentRuntimeMode {
  return value === "deterministic" || value === "ollama" || value === "auto";
}

const isEntrypoint = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isEntrypoint) {
  const port = Number(process.env.PORT ?? 8787);
  const store = createDefaultFileMissionStore();
  const artifactStore = createDefaultFileArtifactContentStore();
  const runStore = createDefaultFileAgentRunStore();
  const toolCallStore = createDefaultFileToolCallStore();
  const gitOperationStore = createDefaultFileGitOperationStore();
  const reviewPacketStore = createDefaultFileReviewPacketStore();
  const missionControllerStore = createDefaultFileMissionControllerStore();
  const missionHistoryStore = createDefaultFileMissionHistoryStore();
  const toolCallService = createDefaultToolCallService(store, artifactStore, toolCallStore);
  const agentRunService = createDefaultAgentRunService(store, artifactStore, runStore);
  const gitOperationService = createDefaultGitOperationService(store, artifactStore, gitOperationStore, reviewPacketStore);
  const reviewPacketService = createDefaultReviewPacketService(
    store,
    artifactStore,
    toolCallStore,
    gitOperationStore,
    reviewPacketStore,
    toolCallService
  );
  const missionHistoryService = new MissionHistoryService({
    historyStore: missionHistoryStore,
    missionStore: store,
    controllerStore: missionControllerStore,
    runStore,
    toolCallStore,
    gitOperationStore,
    reviewPacketStore,
    artifactStore
  });
  const missionControllerService = createDefaultMissionControllerService(
    missionControllerStore,
    store,
    agentRunService,
    toolCallService,
    gitOperationService,
    reviewPacketService,
    missionHistoryService
  );
  const server = createOrchestratorServer({
    store,
    artifactStore,
    runStore,
    runService: agentRunService,
    toolCallStore,
    toolCallService,
    gitOperationStore,
    gitOperationService,
    reviewPacketStore,
    reviewPacketService,
    missionControllerStore,
    missionControllerService,
    missionHistoryService
  });

  void missionControllerService.recoverInterruptedControllers();

  server.listen(port, "127.0.0.1", () => {
    console.log(`Team AI Agent orchestrator listening on http://127.0.0.1:${port}`);
  });
}
