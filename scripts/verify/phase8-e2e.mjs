import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DeterministicAgentExecutor, DeterministicReviewExecutor } from "../../dist/packages/agent-core/src/index.js";
import { AgentRunEventBroker } from "../../dist/apps/orchestrator/src/agent-run-events.js";
import { AgentRunService } from "../../dist/apps/orchestrator/src/agent-run-service.js";
import { FileAgentRunStore } from "../../dist/apps/orchestrator/src/agent-run-store.js";
import { FileArtifactContentStore } from "../../dist/apps/orchestrator/src/artifact-content-store.js";
import { createDefaultOrchestratorArtifactContents, createDefaultOrchestratorSession } from "../../dist/apps/orchestrator/src/fixtures.js";
import { GitOperationService } from "../../dist/apps/orchestrator/src/git-operation-service.js";
import { FileGitOperationStore } from "../../dist/apps/orchestrator/src/git-operation-store.js";
import { MissionControllerService } from "../../dist/apps/orchestrator/src/mission-controller-service.js";
import { FileMissionControllerStore } from "../../dist/apps/orchestrator/src/mission-controller-store.js";
import { MissionHistoryService } from "../../dist/apps/orchestrator/src/mission-history-service.js";
import { FileMissionHistoryStore } from "../../dist/apps/orchestrator/src/mission-history-store.js";
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";
import { ReviewPacketService } from "../../dist/apps/orchestrator/src/review-packet-service.js";
import { FileReviewPacketStore } from "../../dist/apps/orchestrator/src/review-packet-store.js";
import { createOrchestratorServer } from "../../dist/apps/orchestrator/src/server.js";
import { ToolCallService } from "../../dist/apps/orchestrator/src/tool-call-service.js";
import { FileToolCallStore } from "../../dist/apps/orchestrator/src/tool-call-store.js";
import { LocalGitRunner } from "../../dist/packages/git-runner/src/index.js";
import { DEFAULT_LOCAL_CI_COMMANDS, MISSION_CONTROLLER_STAGES } from "../../dist/packages/shared/src/index.js";
import { LocalToolRunner } from "../../dist/packages/tool-runner/src/index.js";
import {
  createAssumptionRecord,
  createRuntimeMissionState,
  createRuntimeSessionSnapshot,
  parseMissionCommand
} from "../../dist/packages/workflow/src/index.js";

const failures = [];
const run = promisify(execFile);
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const root = await mkdtemp(join(tmpdir(), "team-ai-agent-phase8-e2e-"));
const workspace = join(root, "workspace");
await mkdir(join(workspace, "src"), { recursive: true });
await writeFile(join(workspace, "src", "dashboard.ts"), "export const dashboardReady = false;\n", "utf8");
await git(["init"]);
await git(["config", "user.name", "Team AI Agent"]);
await git(["config", "user.email", "team-ai-agent@example.local"]);
await git(["add", "src/dashboard.ts"]);
await git(["commit", "-m", "Initial dashboard fixture"]);
await git(["branch", "-M", "main"]);
await writeFile(join(workspace, "src", "dashboard.ts"), "export const dashboardReady = true;\n", "utf8");

const clock = createClock("2026-06-23T03:00:00.000Z");
const missionStore = new FileMissionStore(join(root, "mission.json"), () => createDefaultOrchestratorSession("2026-06-23T03:00:00.000Z"));
const artifactStore = new FileArtifactContentStore(join(root, "artifacts.json"), () =>
  createDefaultOrchestratorArtifactContents("2026-06-23T03:00:00.000Z")
);
const runStore = new FileAgentRunStore(join(root, "runs.json"));
const toolCallStore = new FileToolCallStore(join(root, "tools.json"));
const gitOperationStore = new FileGitOperationStore(join(root, "git.json"));
const reviewPacketStore = new FileReviewPacketStore(join(root, "reviews.json"));
const controllerStore = new FileMissionControllerStore(join(root, "controllers.json"));
const historyStore = new FileMissionHistoryStore(join(root, "history.json"));
const eventBroker = new AgentRunEventBroker();
const agentRunService = new AgentRunService({
  executor: new DeterministicAgentExecutor(),
  runtimeInfo: async () => ({
    configuredMode: "deterministic",
    activeProvider: "deterministic",
    ollamaAvailable: false,
    ollamaBaseUrl: "http://127.0.0.1:11434",
    model: "qwen3:8b",
    modelAvailable: false,
    message: "Phase 8 E2E verification fixture"
  }),
  runStore,
  missionStore,
  artifactStore,
  eventBroker,
  timeoutMs: 5000,
  now: clock
});
const toolCallService = new ToolCallService({
  runner: createFixtureToolRunner(workspace),
  toolCallStore,
  missionStore,
  artifactStore,
  now: clock
});
const gitOperationService = new GitOperationService({
  runner: new LocalGitRunner({ workspaceRoot: workspace, timeoutMs: 5000 }),
  operationStore: gitOperationStore,
  missionStore,
  artifactStore,
  reviewPacketStore,
  now: clock
});
const reviewPacketService = new ReviewPacketService({
  packetStore: reviewPacketStore,
  missionStore,
  artifactStore,
  toolCallStore,
  gitOperationStore,
  toolCallService,
  now: clock
});
const historyService = new MissionHistoryService({
  historyStore,
  missionStore,
  controllerStore,
  runStore,
  toolCallStore,
  gitOperationStore,
  reviewPacketStore,
  artifactStore,
  now: clock
});
const controllerService = new MissionControllerService({
  controllerStore,
  missionStore,
  agentRunService,
  toolCallService,
  gitOperationService,
  reviewPacketService,
  reviewer: new DeterministicReviewExecutor(),
  historyRecorder: historyService,
  maxAttempts: 2,
  reviewerRevisionLimit: 1,
  now: clock
});
const server = createOrchestratorServer({
  store: missionStore,
  artifactStore,
  runStore,
  toolCallStore,
  gitOperationStore,
  reviewPacketStore,
  missionControllerStore: controllerStore,
  missionHistoryService: historyService,
  runService: agentRunService,
  toolCallService,
  gitOperationService,
  reviewPacketService,
  missionControllerService: controllerService,
  now: clock
});
const address = await new Promise((resolveAddress) => {
  server.listen(0, "127.0.0.1", () => resolveAddress(server.address()));
});
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const health = await requestJson(`${baseUrl}/health`);
  assert(health.status === "ok", "Health endpoint should be reachable.");
  assert(health.agentRuntime.activeProvider === "deterministic", "Phase 8 E2E should use deterministic agent execution.");

  const initialSession = await requestJson(`${baseUrl}/api/mission/session`);
  const command = "Build inventory QA dashboard with API data, tests, repository evidence, reviewer approvals, and delivery report.";
  const savedAt = "2026-06-23T03:01:00.000Z";
  const missionPlan = parseMissionCommand(command);
  const missionAssumptions = [
    createAssumptionRecord({
      missionId: initialSession.missionId,
      assumption: "Inventory source data is available from local fixtures during verification.",
      source: "Phase 8 E2E mission intake",
      ambiguityClass: "low",
      confidence: 88,
      impact: "Validate local evidence before delivery is accepted.",
      ownerRoleId: "lead_ba",
      createdAt: savedAt
    })
  ];
  const savedMission = createRuntimeSessionSnapshot({
    ...initialSession,
    commandDraft: command,
    assumptionDraft: missionAssumptions.map((record) => record.assumption).join("\n"),
    missionAssumptions,
    missionPlan,
    missionState: createRuntimeMissionState({
      commandDraft: command,
      missionPlan,
      savedAt,
      previousState: initialSession.missionState,
      source: "orchestrator",
      status: "saved",
      statusReason: "Phase 8 E2E mission saved through the HTTP session boundary."
    }),
    savedAt
  });
  const persistedMission = await requestJson(`${baseUrl}/api/mission/session`, {
    method: "PUT",
    body: JSON.stringify(savedMission)
  });
  assert(persistedMission.commandDraft === command, "User-entered mission command should persist through PUT /session.");
  assert(persistedMission.missionState.status === "saved", "Mission intake should persist a saved lifecycle state.");
  assert(persistedMission.missionState.source === "orchestrator", "Mission intake should record the orchestrator as source of truth.");
  assert(persistedMission.missionAssumptions[0]?.assumption.includes("Inventory source data"), "Mission intake should persist assumptions.");

  const startBody = {
    missionId: persistedMission.missionId,
    taskId: "task-phase8-e2e",
    command,
    idempotencyKey: "phase8-e2e-controller",
    providerPreference: "deterministic"
  };
  const started = await requestJson(`${baseUrl}/api/mission/controllers`, {
    method: "POST",
    body: JSON.stringify(startBody)
  });
  assert(started.status === "queued", "Controller start should return a queued record.");
  const duplicateStart = await requestJson(`${baseUrl}/api/mission/controllers`, {
    method: "POST",
    body: JSON.stringify(startBody)
  });
  assert(duplicateStart.id === started.id, "Controller start should be idempotent for the same mission request.");

  const completed = await waitForController(started.id);
  assert(completed.status === "completed", `Controller should complete; got ${completed.status}.`);
  assert(completed.currentStage === "handoff_policy", "Completed controller should finish on the handoff policy stage.");
  assert(MISSION_CONTROLLER_STAGES.every((stage) => completed.stageResults.some((item) => item.stage === stage && item.status === "completed")), "Every controller stage should complete.");
  assert(completed.reviewerResults.length === 3, "Controller should collect three local reviewer decisions.");
  assert(completed.reviewerResults.every((item) => item.decision === "pass"), "All local reviewer decisions should pass.");
  assert(Boolean(completed.deliveryArtifactContentId), "Completed controller should reference the delivery artifact.");
  assert(completed.automationDecisions?.some((decision) => decision.kind === "git_branch_push"), "Completed controller should persist branch push automation decision.");
  assert(completed.automationDecisions?.some((decision) => decision.kind === "force_push" && decision.disabled), "Completed controller should persist hard-disabled force push decision.");

  const deliveredSession = await requestJson(`${baseUrl}/api/mission/session`);
  assert(deliveredSession.missionState.status === "delivered", "Session lifecycle should become delivered after controller completion.");
  assert(deliveredSession.missionState.source === "mission_controller", "Controller completion should be visible in the mission lifecycle source.");
  assert(deliveredSession.auditEvents.some((event) => event.action === "mission_controller_completed"), "Delivered session should include a controller completion audit event.");
  assert(deliveredSession.auditEvents.some((event) => event.action === "automation_handoff_completed"), "Delivered session should include an automation handoff policy audit event.");
  assert(deliveredSession.auditEvents.some((event) => event.action === "automation_handoff_execution_skipped"), "Default delivered session should audit skipped remote handoff execution.");

  const agentRuns = await requestJson(`${baseUrl}/api/mission/agent-runs?missionId=${encodeURIComponent(persistedMission.missionId)}`);
  assert(agentRuns.length === 1, "Controller happy path should create one planning agent run.");
  assert(agentRuns[0]?.status === "completed", "Planning agent run should complete.");
  assert(agentRuns[0]?.verification?.decision === "pass", "Planning agent verification should pass.");

  const toolCalls = await requestJson(`${baseUrl}/api/mission/tool-calls?missionId=${encodeURIComponent(persistedMission.missionId)}`);
  const commandCalls = toolCalls.filter((call) => call.kind === "test_command");
  assert(commandCalls.length === DEFAULT_LOCAL_CI_COMMANDS.length + 1, "Controller should collect typecheck plus the default local CI command profile.");
  assert(commandCalls.every((call) => call.status === "completed"), "All deterministic test command calls should complete.");
  assert(new Set(commandCalls.map((call) => call.command)).has("npm run typecheck"), "Tool evidence should include the controller typecheck command.");
  for (const commandName of DEFAULT_LOCAL_CI_COMMANDS) {
    assert(new Set(commandCalls.map((call) => call.command)).has(commandName), `Local CI should include ${commandName}.`);
  }

  const gitOperations = await requestJson(`${baseUrl}/api/mission/git-operations?missionId=${encodeURIComponent(persistedMission.missionId)}`);
  assert(gitOperations.length === 6, "Controller happy path should collect Git read evidence plus handoff policy preflight operations.");
  assert(["status", "diff", "commit_plan"].every((kind) => gitOperations.some((operation) => operation.kind === kind && operation.status === "completed")), "Git evidence should include completed status, diff, and commit plan operations.");
  assert(["remote_evidence", "branch_push_policy", "draft_pr_policy"].every((kind) => gitOperations.some((operation) => operation.kind === kind)), "Handoff policy should include read-only remote evidence and mutation policy preflights.");
  assert(gitOperations.find((operation) => operation.kind === "commit_plan")?.result?.commitPlan?.ready === true, "Commit plan should be ready for the safe changed file.");
  assert(gitOperations.every((operation) => !["local_commit", "branch_push", "draft_pr_create"].includes(operation.kind)), "Controller happy path must not commit, push, or create pull requests.");

  const reviewPackets = await requestJson(`${baseUrl}/api/mission/review-packets?missionId=${encodeURIComponent(persistedMission.missionId)}`);
  assert(reviewPackets.length === 1, "Controller happy path should create one review packet.");
  const deliveredPacket = reviewPackets[0];
  assert(deliveredPacket.status === "delivered", "Review packet should be delivered.");
  assert(deliveredPacket.ciRun?.status === "passed", "Review packet should contain a passing CI run.");
  assert(deliveredPacket.ciRun?.commands.length === DEFAULT_LOCAL_CI_COMMANDS.length, "Review packet CI should run the default command profile.");
  assert(deliveredPacket.reviews.length === 3 && deliveredPacket.reviews.every((review) => review.decision === "pass"), "Review packet should record all required reviewer approvals.");
  assert(deliveredPacket.deliveryArtifactContentId === completed.deliveryArtifactContentId, "Review packet and controller should agree on the delivery artifact.");

  const artifacts = await requestJson(`${baseUrl}/api/mission/artifacts`);
  const deliveryArtifact = artifacts.find((artifact) => artifact.id === completed.deliveryArtifactContentId);
  assert(deliveryArtifact?.source === "review_service", "Delivery artifact should come from the review service.");
  assert(deliveryArtifact?.markdown.includes("## Verification"), "Delivery Markdown should include verification evidence.");
  assert(deliveryArtifact?.markdown.includes("Remote push disabled"), "Delivery Markdown should preserve remote safety boundaries.");
  assert(deliveryArtifact?.markdown.includes("Deploy disabled"), "Delivery Markdown should preserve deployment boundaries.");
  const fetchedDeliveryArtifact = await requestJson(`${baseUrl}/api/mission/artifacts/${encodeURIComponent(completed.deliveryArtifactContentId)}`);
  assert(fetchedDeliveryArtifact.id === completed.deliveryArtifactContentId, "Delivery artifact should be recoverable by id.");

  const history = await requestJson(`${baseUrl}/api/mission/history`);
  const deliveredArchive = history.find((item) => item.kind === "archived" && item.controllerId === completed.id);
  assert(history[0]?.kind === "current", "Mission history should keep the current session at the top.");
  assert(deliveredArchive?.status === "delivered", "Completed controller should be archived as delivered history.");
  const deliveredHistory = await requestJson(`${baseUrl}/api/mission/history/${encodeURIComponent(deliveredArchive.id)}`);
  assert(deliveredHistory.controller.status === "completed", "Delivered history should recover the completed controller.");
  assert(deliveredHistory.agentRuns.length === 1, "Delivered history should recover the planning run.");
  assert(deliveredHistory.toolCalls.length === DEFAULT_LOCAL_CI_COMMANDS.length + 1, "Delivered history should recover tool evidence.");
  assert(deliveredHistory.gitOperations.length === 6, "Delivered history should recover Git evidence and handoff policy preflight.");
  assert(deliveredHistory.reviewPackets[0]?.status === "delivered", "Delivered history should recover delivered review evidence.");
  assert(deliveredHistory.artifactContents.some((artifact) => artifact.id === completed.deliveryArtifactContentId), "Delivered history should recover the delivery artifact.");

  const reset = await requestJson(`${baseUrl}/api/mission/reset`, { method: "POST" });
  assert(reset.missionState.status === "saved", "Reset should restore the default saved mission state.");
  assert((await requestJson(`${baseUrl}/api/mission/controllers`)).length === 0, "Reset should clear active controller records.");
  assert((await requestJson(`${baseUrl}/api/mission/tool-calls`)).length === 0, "Reset should clear active tool evidence.");
  assert((await requestJson(`${baseUrl}/api/mission/git-operations`)).length === 0, "Reset should clear active Git evidence.");
  assert((await requestJson(`${baseUrl}/api/mission/review-packets`)).length === 0, "Reset should clear active review packets.");
  const historyAfterReset = await requestJson(`${baseUrl}/api/mission/history`);
  const archiveAfterReset = historyAfterReset.find((item) => item.id === deliveredArchive.id);
  assert(archiveAfterReset?.status === "delivered", "Reset should keep the delivered archived mission available.");
  const recoveredAfterReset = await requestJson(`${baseUrl}/api/mission/history/${encodeURIComponent(deliveredArchive.id)}`);
  assert(recoveredAfterReset.command === command, "Recovered history should preserve the user-entered command after reset.");
  assert(recoveredAfterReset.controller.status === "completed", "Recovered history should preserve controller completion after reset.");
  assert(recoveredAfterReset.toolCalls.length === DEFAULT_LOCAL_CI_COMMANDS.length + 1, "Recovered history should preserve tool evidence after reset.");
  assert(recoveredAfterReset.gitOperations.every((operation) => !["local_commit", "branch_push", "draft_pr_create"].includes(operation.kind)), "Recovered history must not include mutation operations.");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Phase 8 E2E verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Phase 8 E2E verification passed.");
console.log(`Stages: ${MISSION_CONTROLLER_STAGES.length}; CI commands: ${DEFAULT_LOCAL_CI_COMMANDS.length}; URL: ${baseUrl}`);

function createFixtureToolRunner(workspaceRoot) {
  const policyRunner = new LocalToolRunner({ workspaceRoot, timeoutMs: 5000 });
  return {
    getPolicy: () => policyRunner.getPolicy(),
    evaluate: (request) => policyRunner.evaluate(request),
    execute: async (request) => ({
      summary: `${request.command} passed in the Phase 8 E2E fixture.`,
      evidence: [`Command: ${request.command}`, "Fixture exit code: 0"],
      durationMs: 1,
      exitCode: 0,
      stdout: "verification passed",
      stderr: ""
    })
  };
}

function git(args) {
  return run("git", args, { cwd: workspace });
}

function createClock(startIso) {
  let tick = Date.parse(startIso);
  return () => {
    tick += 1000;
    return new Date(tick).toISOString();
  };
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${url} failed with ${response.status}: ${await response.text()}`);
  return response.json();
}

async function waitForController(controllerId) {
  const url = `${baseUrl}/api/mission/controllers/${encodeURIComponent(controllerId)}`;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const controller = await requestJson(url);
    if (["completed", "blocked", "failed", "cancelled"].includes(controller.status)) return controller;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${controllerId}.`);
}
