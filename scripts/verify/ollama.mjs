import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OllamaAgentExecutor } from "../../dist/packages/agent-core/src/index.js";
import { AgentRunEventBroker } from "../../dist/apps/orchestrator/src/agent-run-events.js";
import { AgentRunService } from "../../dist/apps/orchestrator/src/agent-run-service.js";
import { FileAgentRunStore } from "../../dist/apps/orchestrator/src/agent-run-store.js";
import { FileArtifactContentStore } from "../../dist/apps/orchestrator/src/artifact-content-store.js";
import { createDefaultOrchestratorArtifactContents, createDefaultOrchestratorSession } from "../../dist/apps/orchestrator/src/fixtures.js";
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";

const tempDir = await mkdtemp(join(tmpdir(), "team-ai-agent-ollama-"));
const model = process.env.OLLAMA_MODEL ?? "qwen3:8b";
const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";

try {
  const executor = new OllamaAgentExecutor({ model, baseUrl });
  const info = await executor.getRuntimeInfo("ollama");
  if (!info.ollamaAvailable) throw new Error(`Ollama is unavailable at ${baseUrl}.`);
  if (!info.modelAvailable) throw new Error(`Ollama model ${model} is not installed.`);

  const runStore = new FileAgentRunStore(join(tempDir, "runs.json"));
  const missionStore = new FileMissionStore(join(tempDir, "session.json"), () => createDefaultOrchestratorSession());
  const artifactStore = new FileArtifactContentStore(join(tempDir, "artifacts.json"), () => createDefaultOrchestratorArtifactContents());
  const service = new AgentRunService({
    executor,
    runtimeInfo: () => executor.getRuntimeInfo("ollama"),
    runStore,
    missionStore,
    artifactStore,
    eventBroker: new AgentRunEventBroker(),
    timeoutMs: 180_000,
    maxRevisions: 1
  });
  const started = await service.startRun({
    missionId: "ollama-smoke",
    command: "Plan a local sales dashboard with repository evidence, measurable acceptance criteria, tests, explicit scope, risk owners, and no production deployment.",
    idempotencyKey: "ollama-smoke-1",
    providerPreference: "ollama"
  });
  const run = await service.waitForTerminalRun(started.id, 360_000);
  if (run.provider !== "ollama") throw new Error(`Expected ollama provider, received ${run.provider}.`);
  if (!run.verification) throw new Error(`Ollama run ended as ${run.status} without structured verification.`);
  if (run.traceIds.length < 2) throw new Error("Ollama run did not persist planner and verifier traces.");
  const artifacts = await artifactStore.readArtifacts();
  if (artifacts[0]?.source !== "agent_runtime") throw new Error("Ollama run did not persist an agent runtime artifact.");
  console.log("Ollama live smoke passed.");
  console.log(`Model: ${run.model}`);
  console.log(`Status: ${run.status}`);
  console.log(`Decision: ${run.verification.decision}`);
  console.log(`Usage: ${run.usage.inputTokens} input, ${run.usage.outputTokens} output tokens`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
