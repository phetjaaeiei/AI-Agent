import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeterministicAgentExecutor, AgentExecutionError } from "../../dist/packages/agent-core/src/index.js";
import { AgentRunEventBroker } from "../../dist/apps/orchestrator/src/agent-run-events.js";
import { AgentRunService } from "../../dist/apps/orchestrator/src/agent-run-service.js";
import { FileAgentRunStore } from "../../dist/apps/orchestrator/src/agent-run-store.js";
import { FileArtifactContentStore } from "../../dist/apps/orchestrator/src/artifact-content-store.js";
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";
import { createDefaultOrchestratorArtifactContents, createDefaultOrchestratorSession } from "../../dist/apps/orchestrator/src/fixtures.js";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const tempDir = await mkdtemp(join(tmpdir(), "team-ai-agent-runtime-"));

try {
  const nowValues = Array.from({ length: 100 }, (_, index) => `2026-06-19T10:${String(index).padStart(2, "0")}:00.000Z`);
  let nowIndex = 0;
  const now = () => nowValues[Math.min(nowIndex++, nowValues.length - 1)];
  const runStorePath = join(tempDir, "agent-runs.json");
  const missionStore = new FileMissionStore(join(tempDir, "session.json"), () => createDefaultOrchestratorSession());
  const artifactStore = new FileArtifactContentStore(join(tempDir, "artifacts.json"), () => createDefaultOrchestratorArtifactContents());
  const runStore = new FileAgentRunStore(runStorePath);
  const service = new AgentRunService({
    executor: new DeterministicAgentExecutor(),
    runtimeInfo: async () => ({ configuredMode: "deterministic", activeProvider: "deterministic", ollamaAvailable: false, ollamaBaseUrl: "http://127.0.0.1:11434", model: "qwen3:8b", modelAvailable: false, message: "Fixture" }),
    runStore,
    missionStore,
    artifactStore,
    eventBroker: new AgentRunEventBroker(),
    now,
    timeoutMs: 1000,
    maxRevisions: 1
  });

  const passing = await service.startRun({ missionId: "mission-pass", command: "Build a dashboard with repository evidence.", idempotencyKey: "pass-1", providerPreference: "deterministic" });
  const duplicate = await service.startRun({ missionId: "mission-pass", command: "Build a dashboard with repository evidence.", idempotencyKey: "pass-1", providerPreference: "deterministic" });
  assert(duplicate.id === passing.id, "Idempotent start should return the existing run.");
  const passed = await service.waitForTerminalRun(passing.id);
  assert(passed.status === "completed", "Normal deterministic run should complete.");
  assert(passed.provider === "deterministic", "Deterministic run should record its provider.");
  assert(passed.traceIds.length === 2, "Passing run should record planner and verifier traces.");
  assert(passed.verification?.decision === "pass", "Passing run should persist verifier output.");

  const revisedStart = await service.startRun({ missionId: "mission-revise", command: "Build with evidence [revise]", idempotencyKey: "revise-1", providerPreference: "deterministic" });
  const revised = await service.waitForTerminalRun(revisedStart.id);
  assert(revised.status === "completed", "Revision fixture should complete after one revision.");
  assert(revised.attempt === 2, "Revision fixture should increment attempt.");
  assert(revised.traceIds.length === 4, "Revision fixture should record two planner and two verifier traces.");

  const blockedStart = await service.startRun({ missionId: "mission-block", command: "Build unsafe scope [block]", idempotencyKey: "block-1", providerPreference: "deterministic" });
  const blocked = await service.waitForTerminalRun(blockedStart.id);
  assert(blocked.status === "blocked", "Blocking verifier decision should block the run.");

  const invalidStart = await service.startRun({ missionId: "mission-invalid", command: "Build [invalid-output]", idempotencyKey: "invalid-1", providerPreference: "deterministic" });
  const invalid = await service.waitForTerminalRun(invalidStart.id);
  assert(invalid.status === "failed" && invalid.errorCode === "invalid_output", "Invalid output should create a typed failure.");

  const persisted = JSON.parse(await readFile(runStorePath, "utf8"));
  assert(persisted.schemaVersion === 1, "Agent run store should persist schema version 1.");
  assert(persisted.runs.length === 4, "Agent run store should persist four distinct runs.");
  const restoredStore = new FileAgentRunStore(runStorePath);
  assert((await restoredStore.findRun(passing.id))?.status === "completed", "Completed run should survive store recreation.");

  const slowExecutor = {
    execute: (_request, signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new AgentExecutionError("cancelled", "Slow fixture aborted.")), { once: true });
      setTimeout(() => resolve({}), 5000);
    })
  };
  const timeoutService = new AgentRunService({
    executor: slowExecutor,
    runtimeInfo: service.getRuntimeInfo.bind(service),
    runStore: new FileAgentRunStore(join(tempDir, "timeout-runs.json")),
    missionStore,
    artifactStore,
    eventBroker: new AgentRunEventBroker(),
    timeoutMs: 20
  });
  const timeoutStart = await timeoutService.startRun({ missionId: "mission-timeout", command: "Wait forever", idempotencyKey: "timeout-1" });
  const timedOut = await timeoutService.waitForTerminalRun(timeoutStart.id);
  assert(timedOut.status === "failed" && timedOut.errorCode === "timeout", "Timeout should be recorded separately from cancellation.");

  const cancelService = new AgentRunService({
    executor: slowExecutor,
    runtimeInfo: service.getRuntimeInfo.bind(service),
    runStore: new FileAgentRunStore(join(tempDir, "cancel-runs.json")),
    missionStore,
    artifactStore,
    eventBroker: new AgentRunEventBroker(),
    timeoutMs: 5000
  });
  const cancelStart = await cancelService.startRun({ missionId: "mission-cancel", command: "Cancel me", idempotencyKey: "cancel-1" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const cancelled = await cancelService.cancelRun(cancelStart.id);
  assert(cancelled?.status === "cancelled" && cancelled.errorCode === "cancelled", "Cancellation should persist a cancelled state.");

  console.log("Agent runtime verification passed.");
  console.log(`Runs verified: ${(await runStore.listRuns()).length}`);
  console.log(`Events verified: ${(await runStore.readSnapshot()).events.length}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Agent runtime verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
