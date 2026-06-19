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
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";
import { ReviewPacketService } from "../../dist/apps/orchestrator/src/review-packet-service.js";
import { FileReviewPacketStore } from "../../dist/apps/orchestrator/src/review-packet-store.js";
import { ToolCallService } from "../../dist/apps/orchestrator/src/tool-call-service.js";
import { FileToolCallStore } from "../../dist/apps/orchestrator/src/tool-call-store.js";
import { LocalGitRunner } from "../../dist/packages/git-runner/src/index.js";
import { LocalToolRunner } from "../../dist/packages/tool-runner/src/index.js";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "team-ai-agent-controller-"));
const workspace = join(root, "workspace");
await mkdir(join(workspace, "src"), { recursive: true });
await writeFile(join(workspace, "src", "feature.ts"), "export const feature = false;\n", "utf8");
await git(["init"]);
await git(["config", "user.name", "Team AI Agent"]);
await git(["config", "user.email", "team-ai-agent@example.local"]);
await git(["add", "src/feature.ts"]);
await git(["commit", "-m", "Initial fixture"]);
await writeFile(join(workspace, "src", "feature.ts"), "export const feature = true;\n", "utf8");

try {
  const completeStack = createStack("complete");
  const missionId = (await completeStack.missionStore.readSession()).missionId;
  const started = await completeStack.controllerService.startController({
    missionId,
    taskId: "task-controller-complete",
    command: "Build and verify a local feature with repository evidence.",
    idempotencyKey: "controller-complete",
    providerPreference: "deterministic"
  });
  const duplicate = await completeStack.controllerService.startController({
    missionId,
    taskId: "task-controller-complete",
    command: "Build and verify a local feature with repository evidence.",
    idempotencyKey: "controller-complete",
    providerPreference: "deterministic"
  });
  assert(duplicate.id === started.id, "Controller start should be idempotent.");
  const completed = await completeStack.controllerService.waitForTerminalController(started.id, 15_000);
  assert(completed.status === "completed", `Complete path should finish, got ${completed.status}: ${completed.stopReason?.message ?? "no reason"}`);
  assert(completed.stageResults.filter((item) => item.status === "completed" && item.attempt === 1).length === 7, "Complete path should record all seven stages.");
  assert(completed.reviewerResults.length === 3 && completed.reviewerResults.every((item) => item.decision === "pass"), "Three independent reviewer roles should pass.");
  assert(Boolean(completed.deliveryArtifactContentId), "Complete controller should reference a delivery artifact.");

  const policyStack = createStack("policy", { allowGitRead: false });
  const policyMission = (await policyStack.missionStore.readSession()).missionId;
  const policyRun = await policyStack.controllerService.startController({
    missionId: policyMission,
    taskId: "task-controller-policy",
    command: "Verify policy denial.",
    providerPreference: "deterministic"
  });
  const policyBlocked = await policyStack.controllerService.waitForTerminalController(policyRun.id, 15_000);
  assert(policyBlocked.status === "blocked" && policyBlocked.stopReason?.code === "git_policy", "Disabled Git read should block at the Git policy boundary.");
  const policyRetry = await policyStack.controllerService.retryController(policyBlocked.id);
  const policyRetried = await policyStack.controllerService.waitForTerminalController(policyRetry.id, 15_000);
  assert(policyRetried.attempt === 2 && policyRetried.status === "blocked", "Retry should run one bounded second attempt.");
  let retryLimitRaised = false;
  try { await policyStack.controllerService.retryController(policyRetried.id); } catch { retryLimitRaised = true; }
  assert(retryLimitRaised, "A third controller attempt should be rejected.");

  const ciStack = createStack("ci-failure", { failingCommand: "npm run verify:tool-runner" });
  const ciMission = (await ciStack.missionStore.readSession()).missionId;
  const ciRun = await ciStack.controllerService.startController({ missionId: ciMission, taskId: "task-controller-ci", command: "Verify CI failure.", providerPreference: "deterministic" });
  const ciBlocked = await ciStack.controllerService.waitForTerminalController(ciRun.id, 15_000);
  assert(ciBlocked.status === "blocked" && ciBlocked.stopReason?.code === "ci_failed", "A failed CI command should block the controller.");

  const reviewerStack = createStack("review-revise", { reviewer: createRevisionReviewer() });
  const reviewerMission = (await reviewerStack.missionStore.readSession()).missionId;
  const reviewerRun = await reviewerStack.controllerService.startController({ missionId: reviewerMission, taskId: "task-controller-review", command: "Verify reviewer revision.", providerPreference: "deterministic" });
  const reviewerBlocked = await reviewerStack.controllerService.waitForTerminalController(reviewerRun.id, 15_000);
  assert(reviewerBlocked.status === "blocked" && reviewerBlocked.stopReason?.code === "review_revise", "A repeated reviewer revision should block after the bounded loop.");

  const cancelStack = createStack("cancel");
  const cancelMission = (await cancelStack.missionStore.readSession()).missionId;
  const cancelRun = await cancelStack.controllerService.startController({ missionId: cancelMission, taskId: "task-controller-cancel", command: "Verify cancellation.", providerPreference: "deterministic" });
  const cancelled = await cancelStack.controllerService.cancelController(cancelRun.id);
  assert(cancelled.status === "cancelled" && cancelled.stopReason?.code === "cancelled", "Controller cancellation should be terminal and audited.");

  const recoveryStack = createStack("recovery");
  const recoveryMission = (await recoveryStack.missionStore.readSession()).missionId;
  const recoveredAt = new Date().toISOString();
  await recoveryStack.controllerStore.upsertController({
    schemaVersion: 1,
    id: "mission-controller-recovery",
    idempotencyKey: "controller-recovery",
    missionId: recoveryMission,
    taskId: "task-controller-recovery",
    command: "Resume after restart.",
    providerPreference: "deterministic",
    status: "running",
    currentStage: "git_evidence",
    attempt: 1,
    maxAttempts: 2,
    stageResults: [],
    reviewerResults: [],
    createdAt: recoveredAt,
    startedAt: recoveredAt,
    updatedAt: recoveredAt
  });
  const recoveredCount = await recoveryStack.controllerService.recoverInterruptedControllers();
  assert(recoveredCount === 1, "Recovery should discover one interrupted controller.");
  const recovered = await recoveryStack.controllerService.waitForTerminalController("mission-controller-recovery", 15_000);
  assert(recovered.status === "completed", "Recovered controller should resume idempotently to completion.");

  await completeStack.controllerStore.reset();
  assert((await completeStack.controllerStore.listControllers()).length === 0, "Controller store reset should clear history.");
} finally {
  await rm(root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Mission controller verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Mission controller verification passed.");
console.log("Paths: complete, policy block, retry limit, CI failure, reviewer revision, cancel, recovery.");

function createStack(name, options = {}) {
  const stackRoot = join(root, name);
  const missionStore = new FileMissionStore(join(stackRoot, "mission.json"), () => createDefaultOrchestratorSession());
  const artifactStore = new FileArtifactContentStore(join(stackRoot, "artifacts.json"), () => createDefaultOrchestratorArtifactContents());
  const runStore = new FileAgentRunStore(join(stackRoot, "runs.json"));
  const toolCallStore = new FileToolCallStore(join(stackRoot, "tools.json"));
  const gitOperationStore = new FileGitOperationStore(join(stackRoot, "git.json"));
  const packetStore = new FileReviewPacketStore(join(stackRoot, "reviews.json"));
  const controllerStore = new FileMissionControllerStore(join(stackRoot, "controllers.json"));
  const toolCallService = new ToolCallService({
    runner: createFixtureToolRunner(options.failingCommand),
    toolCallStore,
    missionStore,
    artifactStore
  });
  const gitOperationService = new GitOperationService({
    runner: new LocalGitRunner({ workspaceRoot: workspace, allowGitRead: options.allowGitRead ?? true, timeoutMs: 5000 }),
    operationStore: gitOperationStore,
    missionStore,
    artifactStore
  });
  const reviewPacketService = new ReviewPacketService({ packetStore, missionStore, artifactStore, toolCallStore, gitOperationStore, toolCallService });
  const agentRunService = new AgentRunService({
    executor: new DeterministicAgentExecutor(),
    runtimeInfo: async () => ({ configuredMode: "deterministic", activeProvider: "deterministic", ollamaAvailable: false, ollamaBaseUrl: "http://127.0.0.1:11434", model: "qwen3:8b", modelAvailable: false, message: "Controller fixture" }),
    runStore,
    missionStore,
    artifactStore,
    eventBroker: new AgentRunEventBroker(),
    timeoutMs: 5000
  });
  const controllerService = new MissionControllerService({
    controllerStore,
    missionStore,
    agentRunService,
    toolCallService,
    gitOperationService,
    reviewPacketService,
    reviewer: options.reviewer ?? new DeterministicReviewExecutor(),
    maxAttempts: 2,
    reviewerRevisionLimit: 1
  });
  return { missionStore, controllerStore, controllerService };
}

function createFixtureToolRunner(failingCommand) {
  const policyRunner = new LocalToolRunner({ workspaceRoot: workspace });
  return {
    getPolicy: () => policyRunner.getPolicy(),
    evaluate: (request) => policyRunner.evaluate(request),
    execute: async (request) => {
      const failed = request.command === failingCommand;
      return {
        summary: failed ? `${request.command} failed.` : `${request.command} passed.`,
        evidence: [`Command: ${request.command}`, `Exit code: ${failed ? 1 : 0}`],
        durationMs: 1,
        exitCode: failed ? 1 : 0,
        stdout: failed ? "" : "passed",
        stderr: failed ? "fixture failure" : ""
      };
    }
  };
}

function createRevisionReviewer() {
  return {
    execute: async ({ packet, reviewerRoleId }) => ({
      reviewerRoleId,
      decision: "revise",
      summary: `${reviewerRoleId} requests one more evidence revision.`,
      defects: ["Fixture revision"],
      evidenceIds: [packet.id],
      provider: "deterministic",
      model: "revision-fixture",
      reviewedAt: new Date().toISOString()
    })
  };
}

function git(args) {
  return run("git", args, { cwd: workspace });
}
