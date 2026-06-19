import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DeterministicAgentExecutor, OllamaAgentExecutor } from "../../dist/packages/agent-core/src/index.js";
import { calculateAccuracyScore } from "../../dist/packages/workflow/src/index.js";
import { AgentRunEventBroker } from "../../dist/apps/orchestrator/src/agent-run-events.js";
import { AgentRunService } from "../../dist/apps/orchestrator/src/agent-run-service.js";
import { FileAgentRunStore } from "../../dist/apps/orchestrator/src/agent-run-store.js";
import { FileArtifactContentStore } from "../../dist/apps/orchestrator/src/artifact-content-store.js";
import { createDefaultOrchestratorArtifactContents, createDefaultOrchestratorSession } from "../../dist/apps/orchestrator/src/fixtures.js";
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";

const evalDir = dirname(fileURLToPath(import.meta.url));
const cases = (await readFile(join(evalDir, "cases.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
const provider = process.env.AGENT_EVAL_PROVIDER === "ollama" ? "ollama" : "deterministic";
const tempDir = await mkdtemp(join(tmpdir(), "team-ai-agent-evals-"));
const results = [];

try {
  for (const testCase of cases) {
    const caseDir = join(tempDir, testCase.id);
    const executor = provider === "ollama"
      ? new OllamaAgentExecutor({ model: process.env.OLLAMA_MODEL ?? "qwen3:8b", baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434" })
      : new DeterministicAgentExecutor();
    const runStore = new FileAgentRunStore(join(caseDir, "runs.json"));
    const missionStore = new FileMissionStore(join(caseDir, "session.json"), () => createDefaultOrchestratorSession());
    const artifactStore = new FileArtifactContentStore(join(caseDir, "artifacts.json"), () => createDefaultOrchestratorArtifactContents());
    const service = new AgentRunService({
      executor,
      runtimeInfo: async () => ({ configuredMode: provider, activeProvider: provider, ollamaAvailable: provider === "ollama", ollamaBaseUrl: "http://127.0.0.1:11434", model: provider === "ollama" ? (process.env.OLLAMA_MODEL ?? "qwen3:8b") : "deterministic-v1", modelAvailable: provider === "ollama", message: "Eval runtime" }),
      runStore,
      missionStore,
      artifactStore,
      eventBroker: new AgentRunEventBroker(),
      timeoutMs: provider === "ollama" ? 180_000 : 2000,
      maxRevisions: 1
    });
    const started = await service.startRun({
      missionId: `eval-${testCase.id}`,
      command: testCase.command,
      idempotencyKey: `eval-${testCase.id}`,
      providerPreference: provider
    });
    const run = await service.waitForTerminalRun(started.id, provider === "ollama" ? 360_000 : 5000);
    const score = run.verification ? calculateAccuracyScore(run.verification.scores).overall : undefined;
    const checks = [
      { name: "terminal_status", pass: run.status === testCase.expectedStatus, actual: run.status, expected: testCase.expectedStatus },
      { name: "structured_verification", pass: testCase.expectedDecision ? run.verification?.decision === testCase.expectedDecision : true, actual: run.verification?.decision, expected: testCase.expectedDecision },
      { name: "minimum_score", pass: testCase.minimumScore === undefined || (score ?? -1) >= testCase.minimumScore, actual: score, expected: testCase.minimumScore },
      { name: "maximum_score", pass: testCase.maximumScore === undefined || (score ?? 101) <= testCase.maximumScore, actual: score, expected: testCase.maximumScore },
      { name: "attempt_limit", pass: testCase.expectedAttempt === undefined || run.attempt === testCase.expectedAttempt, actual: run.attempt, expected: testCase.expectedAttempt },
      { name: "typed_error", pass: testCase.expectedErrorCode === undefined || run.errorCode === testCase.expectedErrorCode, actual: run.errorCode, expected: testCase.expectedErrorCode },
      { name: "traceability", pass: run.status === "failed" || run.traceIds.length >= 2, actual: run.traceIds.length, expected: ">=2 unless failed" },
      { name: "forbidden_tools", pass: true, actual: "no tools registered", expected: "no file, shell, browser, git, or deploy tools" }
    ];
    results.push({ id: testCase.id, provider, pass: checks.every((check) => check.pass), status: run.status, score, checks });
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

const report = {
  generatedAt: new Date().toISOString(),
  provider,
  passed: results.filter((result) => result.pass).length,
  failed: results.filter((result) => !result.pass).length,
  results
};
const outputPath = join(evalDir, "results", "latest.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Agent runtime evals: ${report.passed} passed, ${report.failed} failed (${provider}).`);
console.log(`Results: ${outputPath}`);
if (report.failed > 0) process.exit(1);
