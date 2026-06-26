import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
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
import { GitExecutionError, LocalGitRunner } from "../../dist/packages/git-runner/src/index.js";
import { LocalToolRunner } from "../../dist/packages/tool-runner/src/index.js";

const failures = [];
const consoleErrors = [];
const pageErrors = [];
const failedResponses = [];
const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "team-ai-agent-phase8-rendered-"));
const vitePort = await getFreePort();
const vite = spawn(join(process.cwd(), "node_modules", ".bin", "vite"), ["--host", "127.0.0.1", "apps/web", "--port", String(vitePort), "--strictPort"], {
  cwd: process.cwd(),
  env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});
let viteOutput = "";
vite.stdout.on("data", (chunk) => {
  viteOutput += chunk.toString();
});
vite.stderr.on("data", (chunk) => {
  viteOutput += chunk.toString();
});

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const stacks = [];
let browser;

try {
  await waitForHttp(`http://127.0.0.1:${vitePort}`, 30_000);
  const completeStack = await createStack("complete", { allowGitRead: true });
  const blockedStack = await createStack("blocked", { allowGitRead: false });
  const autoHandoffStack = await createStack("auto-handoff", { handoffGitMode: "completed" });
  const blockedHandoffStack = await createStack("blocked-handoff", { handoffGitMode: "blocked" });
  const failedHandoffStack = await createStack("failed-handoff", { handoffGitMode: "failed" });
  stacks.push(completeStack, blockedStack, autoHandoffStack, blockedHandoffStack, failedHandoffStack);

  browser = await chromium.launch();
  const completeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const completePage = await completeContext.newPage();
  instrumentPage(completePage, "complete");
  const completeUrl = `http://127.0.0.1:${vitePort}?orchestrator=${encodeURIComponent(completeStack.baseUrl)}`;
  await completePage.goto(completeUrl, { waitUntil: "domcontentloaded" });
  await completePage.getByRole("region", { name: "Mission intake" }).waitFor({ timeout: 15_000 });
  await assertAutomationPolicyCard(completePage, "desktop intake");
  await assertImplementationPreviewWaiting(completePage, "desktop intake");

  const command = "Build rendered QA inventory dashboard with tests, reviewers, recovery, and delivery evidence.";
  await completePage.getByLabel("Mission intake command").fill(command);
  await completePage.getByLabel("Mission assumptions").fill("Inventory fixtures are local.\nRemote mutation remains disabled.");
  await completePage.getByRole("button", { name: /Save mission/i }).click();
  await completePage.waitForFunction(() => document.querySelector(".mission-state.status-saved"), undefined, { timeout: 15_000 });
  await assertHandoffSignal(completePage, "desktop intake", "waiting", "Remote mutation disabled");
  await assertNoHorizontalOverflow(completePage, "desktop intake");
  await completePage.screenshot({ path: "/tmp/team-ai-agent-h4-intake-desktop.png", fullPage: true });
  await completePage.setViewportSize({ width: 390, height: 844 });
  await completePage.waitForTimeout(150);
  await assertAutomationPolicyCard(completePage, "mobile intake");
  await assertImplementationPreviewWaiting(completePage, "mobile intake");
  await assertHandoffSignal(completePage, "mobile intake", "waiting", "Remote mutation disabled");
  await assertNoHorizontalOverflow(completePage, "mobile intake");
  await completePage.screenshot({ path: "/tmp/team-ai-agent-h4-intake-mobile.png", fullPage: true });

  await completePage.setViewportSize({ width: 1440, height: 900 });
  await completePage.getByRole("button", { name: /Run local agents/i }).click();
  await waitForControllerStatus(completePage, "completed", 25_000);
  await completePage.reload({ waitUntil: "domcontentloaded" });
  await completePage.getByRole("region", { name: "Mission intake" }).waitFor({ timeout: 15_000 });
  await waitForControllerStatus(completePage, "completed", 15_000);
  await completePage.getByLabel("Autonomous mission controller").waitFor({ timeout: 10_000 });
  await assertControllerHandoffDecisions(completePage, "desktop delivered");
  await assertImplementationPreviewGenerated(completePage, "desktop delivered");
  await assertSkippedRemoteHandoffExecution(completePage, "desktop delivered");
  await assertHandoffSignal(completePage, "desktop delivered", "skipped", "No eligible bounded-auto handoff");
  await completePage.locator(".mission-history-row").filter({ hasText: "delivered" }).first().waitFor({ timeout: 15_000 });
  await completePage.getByLabel("Hardening guidance").filter({ hasText: "Delivery evidence is ready" }).first().waitFor({ timeout: 10_000 });
  await assertNoHorizontalOverflow(completePage, "desktop delivered");
  await completePage.screenshot({ path: "/tmp/team-ai-agent-h4-delivered-desktop.png", fullPage: true });
  await completePage.setViewportSize({ width: 390, height: 844 });
  await completePage.waitForTimeout(150);
  await assertControllerHandoffDecisions(completePage, "mobile delivered");
  await assertImplementationPreviewGenerated(completePage, "mobile delivered");
  await assertSkippedRemoteHandoffExecution(completePage, "mobile delivered");
  await assertHandoffSignal(completePage, "mobile delivered", "skipped", "No eligible bounded-auto handoff");
  await assertNoHorizontalOverflow(completePage, "mobile delivered");
  await completePage.screenshot({ path: "/tmp/team-ai-agent-h4-delivered-mobile.png", fullPage: true });

  await completePage.setViewportSize({ width: 1440, height: 900 });
  await selectArchivedHistoryRow(completePage, "delivered");
  await completePage.getByLabel("Recovered mission evidence").waitFor({ timeout: 10_000 });
  await completePage.getByLabel("Recovered controller run").waitFor({ timeout: 10_000 });
  await assertControllerHandoffDecisions(completePage.getByLabel("Recovered mission evidence"), "desktop recovery");
  await assertImplementationPreviewGenerated(completePage.getByLabel("Recovered mission evidence"), "desktop recovery");
  await assertSkippedRemoteHandoffExecution(completePage.getByLabel("Recovered mission evidence"), "desktop recovery");
  await completePage.getByLabel("Recovered delivery packet").waitFor({ timeout: 10_000 });
  await assertNoHorizontalOverflow(completePage, "desktop recovery");
  await completePage.screenshot({ path: "/tmp/team-ai-agent-h4-recovery-desktop.png", fullPage: true });
  await completePage.setViewportSize({ width: 390, height: 844 });
  await completePage.waitForTimeout(150);
  await assertControllerHandoffDecisions(completePage.getByLabel("Recovered mission evidence"), "mobile recovery");
  await assertImplementationPreviewGenerated(completePage.getByLabel("Recovered mission evidence"), "mobile recovery");
  await assertSkippedRemoteHandoffExecution(completePage.getByLabel("Recovered mission evidence"), "mobile recovery");
  await assertNoHorizontalOverflow(completePage, "mobile recovery");
  await completePage.screenshot({ path: "/tmp/team-ai-agent-h4-recovery-mobile.png", fullPage: true });
  await completeContext.close();

  const autoContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const autoPage = await autoContext.newPage();
  instrumentPage(autoPage, "auto-handoff");
  const autoUrl = `http://127.0.0.1:${vitePort}?orchestrator=${encodeURIComponent(autoHandoffStack.baseUrl)}`;
  await autoPage.goto(autoUrl, { waitUntil: "domcontentloaded" });
  await autoPage.getByRole("region", { name: "Mission intake" }).waitFor({ timeout: 15_000 });
  await autoPage.getByLabel("Mission intake command").fill("Verify completed bounded remote handoff execution in Mission Control.");
  await autoPage.getByLabel("Mission assumptions").fill("Remote handoff fixture is policy enabled.\nMerge and deployment remain manual.");
  await autoPage.getByRole("button", { name: /Save mission/i }).click();
  await autoPage.waitForFunction(() => document.querySelector(".mission-state.status-saved"), undefined, { timeout: 15_000 });
  await autoPage.getByRole("button", { name: /Run local agents/i }).click();
  await waitForControllerStatus(autoPage, "completed", 25_000);
  await autoPage.reload({ waitUntil: "domcontentloaded" });
  await autoPage.getByRole("region", { name: "Mission intake" }).waitFor({ timeout: 15_000 });
  await waitForControllerStatus(autoPage, "completed", 15_000);
  await assertControllerHandoffDecisions(autoPage, "desktop auto handoff delivered");
  await assertCompletedRemoteHandoffExecution(autoPage, "desktop auto handoff delivered");
  await assertHandoffSignal(autoPage, "desktop auto handoff delivered", "completed", "Branch pushed, draft PR ready");
  await assertNoHorizontalOverflow(autoPage, "desktop auto handoff delivered");
  await autoPage.screenshot({ path: "/tmp/team-ai-agent-h4-auto-handoff-desktop.png", fullPage: true });
  await autoPage.setViewportSize({ width: 390, height: 844 });
  await autoPage.waitForTimeout(150);
  await assertCompletedRemoteHandoffExecution(autoPage, "mobile auto handoff delivered");
  await assertHandoffSignal(autoPage, "mobile auto handoff delivered", "completed", "Branch pushed, draft PR ready");
  await assertNoHorizontalOverflow(autoPage, "mobile auto handoff delivered");
  await autoPage.screenshot({ path: "/tmp/team-ai-agent-h4-auto-handoff-mobile.png", fullPage: true });

  await autoPage.setViewportSize({ width: 1440, height: 900 });
  await selectArchivedHistoryRow(autoPage, "delivered");
  await autoPage.getByLabel("Recovered mission evidence").waitFor({ timeout: 10_000 });
  await assertControllerHandoffDecisions(autoPage.getByLabel("Recovered mission evidence"), "desktop auto handoff recovery");
  await assertCompletedRemoteHandoffExecution(autoPage.getByLabel("Recovered mission evidence"), "desktop auto handoff recovery");
  await assertNoHorizontalOverflow(autoPage, "desktop auto handoff recovery");
  await autoPage.screenshot({ path: "/tmp/team-ai-agent-h4-auto-handoff-recovery-desktop.png", fullPage: true });
  await autoPage.setViewportSize({ width: 390, height: 844 });
  await autoPage.waitForTimeout(150);
  await assertCompletedRemoteHandoffExecution(autoPage.getByLabel("Recovered mission evidence"), "mobile auto handoff recovery");
  await assertNoHorizontalOverflow(autoPage, "mobile auto handoff recovery");
  await autoPage.screenshot({ path: "/tmp/team-ai-agent-h4-auto-handoff-recovery-mobile.png", fullPage: true });
  await autoContext.close();

  await assertInterruptedRemoteHandoffScenario({
    browser,
    expectedMessage: "Branch push blocked by rendered QA connector policy.",
    expectedSignalDetail: "Branch push blocked by rendered QA connector policy.",
    expectedStatus: "blocked",
    screenshotPrefix: "blocked-handoff",
    stack: blockedHandoffStack,
    vitePort
  });

  await assertInterruptedRemoteHandoffScenario({
    browser,
    expectedMessage: "Branch push failed after policy preflight in rendered QA fixture.",
    expectedSignalDetail: "Branch push failed after policy preflight in rendered QA fixture.",
    expectedStatus: "failed",
    screenshotPrefix: "failed-handoff",
    stack: failedHandoffStack,
    vitePort
  });

  const blockedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const blockedPage = await blockedContext.newPage();
  instrumentPage(blockedPage, "blocked");
  const blockedUrl = `http://127.0.0.1:${vitePort}?orchestrator=${encodeURIComponent(blockedStack.baseUrl)}`;
  await blockedPage.goto(blockedUrl, { waitUntil: "domcontentloaded" });
  await blockedPage.getByRole("region", { name: "Mission intake" }).waitFor({ timeout: 15_000 });
  await assertAutomationPolicyCard(blockedPage, "blocked desktop intake");
  await blockedPage.getByLabel("Mission intake command").fill("Verify blocked mission state with Git read policy disabled.");
  await blockedPage.getByRole("button", { name: /Save mission/i }).click();
  await blockedPage.waitForFunction(() => document.querySelector(".mission-state.status-saved"), undefined, { timeout: 15_000 });
  await blockedPage.getByRole("button", { name: /Run local agents/i }).click();
  await waitForControllerStatus(blockedPage, "blocked", 25_000);
  await blockedPage.getByRole("button", { name: /Retry mission/i }).waitFor({ timeout: 10_000 });
  await blockedPage.locator(".controller-stop-reason").waitFor({ timeout: 10_000 });
  await blockedPage.locator(".controller-current-stage").filter({ hasText: "git evidence" }).waitFor({ timeout: 10_000 });
  await blockedPage.getByLabel("Hardening guidance").filter({ hasText: "Git read disabled" }).first().waitFor({ timeout: 10_000 });
  await blockedPage.getByLabel("Hardening guidance").filter({ hasText: "Retry boundary" }).first().waitFor({ timeout: 10_000 });
  await assertNoHorizontalOverflow(blockedPage, "desktop blocked");
  await blockedPage.screenshot({ path: "/tmp/team-ai-agent-h4-blocked-desktop.png", fullPage: true });
  await blockedPage.setViewportSize({ width: 390, height: 844 });
  await blockedPage.waitForTimeout(150);
  await assertNoHorizontalOverflow(blockedPage, "mobile blocked");
  await blockedPage.screenshot({ path: "/tmp/team-ai-agent-h4-blocked-mobile.png", fullPage: true });
  await blockedContext.close();

  assert(consoleErrors.length === 0, `Console errors were recorded: ${consoleErrors.join(" | ")}`);
  assert(pageErrors.length === 0, `Page errors were recorded: ${pageErrors.join(" | ")}`);
  assert(failedResponses.length === 0, `Failed network responses were recorded: ${failedResponses.join(" | ")}`);
} finally {
  if (browser) await browser.close();
  await Promise.all(stacks.map((stack) => stack.close()));
  vite.kill("SIGTERM");
  await waitForExit(vite, 3000);
  await rm(root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Phase 8 rendered QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(viteOutput.trim());
  process.exit(1);
}

console.log("Phase 8 rendered QA passed.");
console.log("Screenshots: /tmp/team-ai-agent-h4-intake-desktop.png, /tmp/team-ai-agent-h4-intake-mobile.png, /tmp/team-ai-agent-h4-delivered-desktop.png, /tmp/team-ai-agent-h4-delivered-mobile.png, /tmp/team-ai-agent-h4-recovery-desktop.png, /tmp/team-ai-agent-h4-recovery-mobile.png, /tmp/team-ai-agent-h4-auto-handoff-desktop.png, /tmp/team-ai-agent-h4-auto-handoff-mobile.png, /tmp/team-ai-agent-h4-auto-handoff-recovery-desktop.png, /tmp/team-ai-agent-h4-auto-handoff-recovery-mobile.png, /tmp/team-ai-agent-h4-blocked-handoff-desktop.png, /tmp/team-ai-agent-h4-blocked-handoff-mobile.png, /tmp/team-ai-agent-h4-blocked-handoff-recovery-desktop.png, /tmp/team-ai-agent-h4-blocked-handoff-recovery-mobile.png, /tmp/team-ai-agent-h4-failed-handoff-desktop.png, /tmp/team-ai-agent-h4-failed-handoff-mobile.png, /tmp/team-ai-agent-h4-failed-handoff-recovery-desktop.png, /tmp/team-ai-agent-h4-failed-handoff-recovery-mobile.png, /tmp/team-ai-agent-h4-blocked-desktop.png, /tmp/team-ai-agent-h4-blocked-mobile.png");

async function createStack(name, { allowGitRead = true, handoffGitMode = "none" }) {
  const stackRoot = join(root, name);
  const workspace = join(stackRoot, "workspace");
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src", "dashboard.ts"), "export const renderedQaReady = false;\n", "utf8");
  await git(workspace, ["init"]);
  await git(workspace, ["config", "user.name", "Team AI Agent"]);
  await git(workspace, ["config", "user.email", "team-ai-agent@example.local"]);
  await git(workspace, ["add", "src/dashboard.ts"]);
  await git(workspace, ["commit", "-m", "Initial rendered QA fixture"]);
  await git(workspace, ["branch", "-M", "main"]);
  await writeFile(join(workspace, "src", "dashboard.ts"), "export const renderedQaReady = true;\n", "utf8");

  const clock = createClock("2026-06-23T04:00:00.000Z");
  const missionStore = new FileMissionStore(join(stackRoot, "mission.json"), () => createDefaultOrchestratorSession("2026-06-23T04:00:00.000Z"));
  const artifactStore = new FileArtifactContentStore(join(stackRoot, "artifacts.json"), () =>
    createDefaultOrchestratorArtifactContents("2026-06-23T04:00:00.000Z")
  );
  const runStore = new FileAgentRunStore(join(stackRoot, "runs.json"));
  const toolCallStore = new FileToolCallStore(join(stackRoot, "tools.json"));
  const gitOperationStore = new FileGitOperationStore(join(stackRoot, "git.json"));
  const reviewPacketStore = new FileReviewPacketStore(join(stackRoot, "reviews.json"));
  const controllerStore = new FileMissionControllerStore(join(stackRoot, "controllers.json"));
  const historyStore = new FileMissionHistoryStore(join(stackRoot, "history.json"));
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
      message: "Phase 8 rendered QA fixture"
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
  const gitRunner = handoffGitMode !== "none"
    ? createAutoHandoffGitRunner(workspace, clock, handoffGitMode)
    : new LocalGitRunner({ workspaceRoot: workspace, allowGitRead, timeoutMs: 5000 });
  const gitOperationService = new GitOperationService({
    runner: gitRunner,
    operationStore: gitOperationStore,
    missionStore,
    artifactStore,
    reviewPacketStore,
    toolCallStore,
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
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose))
  };
}

function createFixtureToolRunner(workspaceRoot) {
  const policyRunner = new LocalToolRunner({ workspaceRoot, timeoutMs: 5000 });
  return {
    getPolicy: () => policyRunner.getPolicy(),
    evaluate: (request) => policyRunner.evaluate(request),
    execute: async (request) => {
      if (request.kind === "file_write") return policyRunner.execute(request);
      return {
        summary: `${request.command} passed in the Phase 8 rendered QA fixture.`,
        evidence: [`Command: ${request.command}`, "Fixture exit code: 0"],
        durationMs: 1,
        exitCode: 0,
        stdout: "verification passed",
        stderr: ""
      };
    }
  };
}

function createAutoHandoffGitRunner(workspaceRoot, clock, mode = "completed") {
  const headSha = "b".repeat(40);
  const policy = {
    schemaVersion: 1,
    workspaceRoot,
    allowedWorkspaceRoots: [workspaceRoot],
    allowGitRead: true,
    allowRemoteRead: true,
    allowGitCommit: false,
    allowRemotePush: true,
    allowPullRequestCreate: true,
    timeoutMs: 5000,
    maxDiffBytes: 80_000,
    deniedPathPatterns: [".env", ".data", "node_modules", "dist"]
  };

  return {
    getPolicy: () => policy,
    evaluate: () => ({
      allowed: true,
      normalizedCwd: workspaceRoot,
      reason: "Auto handoff rendered QA fixture policy allowed."
    }),
    execute: async (request) => {
      const branchName = request.branchName ?? "codex/rendered-auto-handoff";
      const checkedAt = clock();
      const worktree = {
        isRepository: true,
        branch: branchName,
        headSha,
        isClean: true,
        hasDeniedChanges: false,
        files: [{ path: "src/dashboard.ts", indexStatus: "M", worktreeStatus: " ", kind: "modified", isDenied: false }],
        summary: `Auto handoff fixture is clean on ${branchName}.`,
        checkedAt
      };
      const diff = {
        changedFiles: 1,
        insertions: 1,
        deletions: 0,
        files: [{ path: "src/dashboard.ts", insertions: 1, deletions: 0, status: "modified", isDenied: false }],
        clipped: false
      };
      const commitPlan = {
        branchName,
        commitMessage: "Update rendered auto handoff fixture",
        summary: "Commit plan is ready for rendered auto handoff evidence.",
        changedFiles: ["src/dashboard.ts"],
        requiredEvidence: ["Rendered QA evidence", "Reviewer approval"],
        risks: ["Fixture-only remote handoff path."],
        reviewers: ["tech_lead", "automation_qa"],
        ready: true
      };
      const remoteHealth = {
        remoteName: "origin",
        provider: "github",
        repository: "phetjaaeiei/AI-Agent",
        sanitizedUrl: "https://github.com/phetjaaeiei/AI-Agent.git",
        defaultBranch: "main",
        currentBranch: branchName,
        localHeadSha: headSha,
        remoteHeadSha: headSha,
        trackingBranch: `origin/${branchName}`,
        ahead: 0,
        behind: 0,
        access: "ok",
        githubAuthenticated: true,
        githubViewer: "team-ai-agent-fixture",
        checkedAt,
        summary: "GitHub remote access is available in the rendered QA fixture."
      };
      const remoteMutationPolicy = (mutationKind) => ({
        mutationKind,
        allowed: true,
        reason: `${mutationKind === "branch_push" ? "Branch push" : "Draft PR creation"} policy preflight passed with reviewed delivery evidence.`,
        actorRoleId: "release_manager",
        branchName,
        commitSha: headSha,
        remoteName: "origin",
        remoteTarget: "phetjaaeiei/AI-Agent",
        baseBranch: "main",
        permissionAllowed: true,
        reviewedDeliveryRequired: true,
        reviewedDeliveryPresent: true,
        reviewPacketId: request.reviewPacketId,
        deliveryArtifactContentId: "rendered-auto-handoff-delivery",
        forcePushAllowed: false,
        branchDeletionAllowed: false,
        blockers: [],
        checkedAt
      });

      if (request.kind === "status") {
        return {
          summary: worktree.summary,
          evidence: [`Branch: ${branchName}`, `HEAD: ${headSha}`, "Clean: true"],
          durationMs: 1,
          worktree
        };
      }
      if (request.kind === "diff") {
        return {
          summary: "Git diff has 1 changed file for rendered auto handoff fixture.",
          evidence: ["src/dashboard.ts: +1/-0"],
          durationMs: 1,
          worktree,
          diff
        };
      }
      if (request.kind === "commit_plan") {
        return {
          summary: commitPlan.summary,
          evidence: [`Branch proposal: ${branchName}`, "Ready: true"],
          durationMs: 1,
          worktree,
          diff,
          commitPlan
        };
      }
      if (request.kind === "remote_evidence") {
        return {
          summary: `${branchName} is published and current.`,
          evidence: [`Branch: ${branchName}`, "Publication: published_current"],
          durationMs: 1,
          worktree,
          remoteHealth,
          remoteEvidence: {
            remoteName: "origin",
            provider: "github",
            repository: "phetjaaeiei/AI-Agent",
            branchName,
            defaultBranch: "main",
            localCommitSha: headSha,
            remoteCommitSha: headSha,
            publicationState: "published_current",
            pullRequest: { state: "none", summary: "No draft PR exists before bounded handoff execution." },
            checks: { state: "passing", total: 1, passed: 1, pending: 0, failed: 0, summary: "1 passing check." },
            blockedActions: [
              "Merge remains a human decision.",
              "Deployment and production actions are disabled.",
              "Force push is disabled.",
              "Branch deletion is disabled."
            ],
            retryable: false,
            checkedAt,
            summary: `${branchName} is published and current.`
          }
        };
      }
      if (request.kind === "branch_push_policy" || request.kind === "draft_pr_policy") {
        const mutationKind = request.kind === "branch_push_policy" ? "branch_push" : "draft_pr";
        const policyResult = remoteMutationPolicy(mutationKind);
        return {
          summary: policyResult.reason,
          evidence: [`Mutation: ${mutationKind}`, `Branch: ${branchName}`, "Reviewed delivery present: true"],
          durationMs: 1,
          worktree,
          diff,
          commitPlan,
          remoteHealth,
          remoteMutationPolicy: policyResult
        };
      }
      if (request.kind === "branch_push") {
        if (mode === "blocked") {
          throw new GitExecutionError("remote_disabled", "Branch push blocked by rendered QA connector policy.");
        }
        if (mode === "failed") {
          throw new GitExecutionError("command_failed", "Branch push failed after policy preflight in rendered QA fixture.");
        }
        const policyResult = remoteMutationPolicy("branch_push");
        return {
          summary: `Pushed ${branchName} to origin at ${headSha.slice(0, 12)}.`,
          evidence: [`Remote: origin`, `Branch: ${branchName}`, `Commit: ${headSha}`, "Force push: disabled", "Branch deletion: disabled"],
          durationMs: 1,
          worktree,
          remoteHealth,
          remoteMutationPolicy: policyResult,
          branchPush: {
            remoteName: "origin",
            branchName,
            commitSha: headSha,
            remoteTarget: "phetjaaeiei/AI-Agent",
            trackingBranch: `origin/${branchName}`,
            pushedAt: checkedAt,
            summary: `Pushed ${branchName}.`
          }
        };
      }
      if (request.kind === "draft_pr_create") {
        const policyResult = remoteMutationPolicy("draft_pr");
        const title = request.pullRequestTitle?.trim() || "Draft PR: Rendered auto handoff fixture";
        const body = request.pullRequestBody?.trim() || [
          "## Verification",
          "Rendered QA fixture completed bounded remote handoff.",
          "",
          "## Remote Safety",
          "Merge remains manual."
        ].join("\n");
        return {
          summary: `Created draft PR for ${branchName} into main.`,
          evidence: [`PR: https://github.com/phetjaaeiei/AI-Agent/pull/789`, "Draft: true", "Base: main", `Head: ${branchName}`],
          durationMs: 1,
          worktree,
          commitPlan,
          remoteHealth,
          remoteMutationPolicy: policyResult,
          draftPullRequest: {
            url: "https://github.com/phetjaaeiei/AI-Agent/pull/789",
            number: 789,
            title,
            body,
            baseBranch: "main",
            headBranch: branchName,
            remoteTarget: "phetjaaeiei/AI-Agent",
            draft: true,
            createdAt: checkedAt,
            summary: `Created draft PR for ${branchName}.`
          }
        };
      }

      return {
        summary: `${request.kind} is not used by the rendered auto handoff fixture.`,
        evidence: [`Kind: ${request.kind}`],
        durationMs: 1,
        worktree
      };
    }
  };
}

function instrumentPage(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(`${label}: ${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${label}: ${response.status()} ${response.url()}`);
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  assert(
    metrics.scrollWidth <= metrics.clientWidth + 1 && metrics.bodyScrollWidth <= metrics.clientWidth + 1,
    `${label} should not have horizontal overflow (${JSON.stringify(metrics)}).`
  );
}

async function assertAutomationPolicyCard(page, label) {
  const card = page.getByLabel("Guarded automation policy");
  await card.waitFor({ timeout: 10_000 });
  await card.getByText("Automation Policy").waitFor({ timeout: 10_000 });
  await card.getByText("auto-ready").waitFor({ timeout: 10_000 });
  await card.getByText("Merge", { exact: true }).waitFor({ timeout: 10_000 });
  await card.getByText("Manual").first().waitFor({ timeout: 10_000 });
  await card.getByText("Force push", { exact: true }).waitFor({ timeout: 10_000 });
  await card.getByText("Disabled").first().waitFor({ timeout: 10_000 });

  const rowCount = await card.locator(".automation-policy-row").count();
  assert(rowCount >= 10, `${label} should render automation policy rows.`);
}

async function assertHandoffSignal(page, label, expectedValue, expectedDetail) {
  await page.getByLabel("Pixel war room mission signals").waitFor({ timeout: 10_000 });
  await page.waitForFunction(
    ({ detail, value }) => {
      const tiles = [...document.querySelectorAll(".signal-tile")];
      const tile = tiles.find((item) => item.querySelector("span")?.textContent?.trim() === "Handoff");
      const actual = {
        detail: tile?.querySelector("p")?.textContent?.trim() ?? "",
        value: tile?.querySelector("strong")?.textContent?.trim() ?? ""
      };
      return actual.value === value && actual.detail === detail;
    },
    { detail: expectedDetail, value: expectedValue },
    { timeout: 10_000 }
  );
  const actual = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll(".signal-tile")];
    const tile = tiles.find((item) => item.querySelector("span")?.textContent?.trim() === "Handoff");
    return {
      detail: tile?.querySelector("p")?.textContent?.trim() ?? "",
      value: tile?.querySelector("strong")?.textContent?.trim() ?? ""
    };
  });
  assert(
    actual.value === expectedValue && actual.detail === expectedDetail,
    `${label} should show Handoff signal ${expectedValue} / ${expectedDetail}, got ${actual.value} / ${actual.detail}.`
  );
}

async function assertControllerHandoffDecisions(rootLocator, label) {
  const summary = rootLocator.getByLabel("Controller handoff decisions").first();
  await summary.waitFor({ timeout: 10_000 });
  await summary.getByText("Branch push", { exact: true }).waitFor({ timeout: 10_000 });
  await summary.getByText("Draft PR", { exact: true }).waitFor({ timeout: 10_000 });
  await summary.getByText("Force push", { exact: true }).waitFor({ timeout: 10_000 });
  await summary.getByText("Disabled").first().waitFor({ timeout: 10_000 });

  const rowCount = await summary.locator(".automation-decision-row").count();
  assert(rowCount >= 10, `${label} should render controller handoff decision rows.`);
}

async function assertImplementationPreviewWaiting(rootLocator, label) {
  const card = rootLocator.getByLabel("Implementation preview").first();
  await card.waitFor({ timeout: 10_000 });
  await card.getByText("waiting", { exact: true }).waitFor({ timeout: 10_000 });
  await card.getByText("Waiting for implementation patch").waitFor({ timeout: 10_000 });
  await card.getByLabel("Rendered implementation preview").waitFor({ timeout: 10_000 });
  await card.getByText("Implementation surface will render here").waitFor({ timeout: 10_000 });
  assert(await card.locator(".implementation-preview-sections article").count() >= 2, `${label} should render waiting implementation preview sections.`);
  assert(await card.locator(".implementation-preview-surface-panels article").count() >= 2, `${label} should render waiting implementation preview surface panels.`);
}

async function assertImplementationPreviewGenerated(rootLocator, label) {
  const card = rootLocator.getByLabel("Implementation preview").first();
  await card.waitFor({ timeout: 10_000 });
  await card.getByText("generated", { exact: true }).waitFor({ timeout: 10_000 });
  await card.getByText("Local Code Patch").waitFor({ timeout: 10_000 });
  await card.getByLabel("Rendered implementation preview").waitFor({ timeout: 10_000 });
  await card.getByText("Local patch preview is ready").waitFor({ timeout: 10_000 });
  await card.getByText("Recovery", { exact: true }).waitFor({ timeout: 10_000 });
  await card.locator(".implementation-preview-facts strong").filter({ hasText: "apps/web/src/generated/implementation-surfaces/" }).first().waitFor({ timeout: 10_000 });
  assert(await card.locator(".implementation-preview-sections article").count() >= 2, `${label} should render generated implementation preview sections.`);
  assert(await card.locator(".implementation-preview-surface-panels article").count() >= 3, `${label} should render generated implementation preview surface panels.`);
}

async function assertSkippedRemoteHandoffExecution(rootLocator, label) {
  const card = rootLocator.getByLabel("Remote handoff execution").first();
  await card.waitFor({ timeout: 10_000 });
  await card.getByRole("heading", { name: /remote handoff execution/i }).waitFor({ timeout: 10_000 });
  await card.getByText("skipped", { exact: true }).first().waitFor({ timeout: 10_000 });
  await card.getByText("Branch push", { exact: true }).waitFor({ timeout: 10_000 });
  await card.getByText("Draft PR", { exact: true }).waitFor({ timeout: 10_000 });

  const rowCount = await card.locator(".remote-handoff-row").count();
  assert(rowCount === 3, `${label} should render remote handoff execution rows.`);
  const skippedRows = await card.locator(".remote-handoff-row.status-skipped").count();
  assert(skippedRows === 3, `${label} should render all remote handoff rows as skipped.`);
}

async function assertCompletedRemoteHandoffExecution(rootLocator, label) {
  const card = rootLocator.getByLabel("Remote handoff execution").first();
  await card.waitFor({ timeout: 10_000 });
  await card.getByRole("heading", { name: /remote handoff execution/i }).waitFor({ timeout: 10_000 });
  await card.getByText("completed", { exact: true }).first().waitFor({ timeout: 10_000 });
  await card.getByText("Branch push", { exact: true }).waitFor({ timeout: 10_000 });
  await card.getByText("Draft PR", { exact: true }).waitFor({ timeout: 10_000 });
  await card.getByText(/codex\/.* pushed/).waitFor({ timeout: 10_000 });
  await card.getByText("https://github.com/phetjaaeiei/AI-Agent/pull/789").waitFor({ timeout: 10_000 });

  const rowCount = await card.locator(".remote-handoff-row").count();
  assert(rowCount === 3, `${label} should render remote handoff execution rows.`);
  const completedRows = await card.locator(".remote-handoff-row.status-completed").count();
  assert(completedRows === 3, `${label} should render all remote handoff rows as completed.`);
}

async function assertInterruptedRemoteHandoffScenario({
  browser,
  expectedMessage,
  expectedSignalDetail,
  expectedStatus,
  screenshotPrefix,
  stack,
  vitePort
}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  instrumentPage(page, screenshotPrefix);
  const url = `http://127.0.0.1:${vitePort}?orchestrator=${encodeURIComponent(stack.baseUrl)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("region", { name: "Mission intake" }).waitFor({ timeout: 15_000 });
  await page.getByLabel("Mission intake command").fill(`Verify ${expectedStatus} bounded remote handoff execution in Mission Control.`);
  await page.getByLabel("Mission assumptions").fill("Remote handoff fixture is policy enabled.\nThe final remote operation is intentionally interrupted.");
  await page.getByRole("button", { name: /Save mission/i }).click();
  await page.waitForFunction(() => document.querySelector(".mission-state.status-saved"), undefined, { timeout: 15_000 });
  await page.getByRole("button", { name: /Run local agents/i }).click();
  await waitForControllerStatus(page, "completed", 25_000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("region", { name: "Mission intake" }).waitFor({ timeout: 15_000 });
  await waitForControllerStatus(page, "completed", 15_000);
  await assertControllerHandoffDecisions(page, `desktop ${screenshotPrefix} delivered`);
  await assertInterruptedRemoteHandoffExecution(page, `desktop ${screenshotPrefix} delivered`, expectedStatus, expectedMessage);
  await assertHandoffSignal(page, `desktop ${screenshotPrefix} delivered`, expectedStatus, expectedSignalDetail);
  await assertNoHorizontalOverflow(page, `desktop ${screenshotPrefix} delivered`);
  await page.screenshot({ path: `/tmp/team-ai-agent-h4-${screenshotPrefix}-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await assertInterruptedRemoteHandoffExecution(page, `mobile ${screenshotPrefix} delivered`, expectedStatus, expectedMessage);
  await assertHandoffSignal(page, `mobile ${screenshotPrefix} delivered`, expectedStatus, expectedSignalDetail);
  await assertNoHorizontalOverflow(page, `mobile ${screenshotPrefix} delivered`);
  await page.screenshot({ path: `/tmp/team-ai-agent-h4-${screenshotPrefix}-mobile.png`, fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await selectArchivedHistoryRow(page, "delivered");
  await page.getByLabel("Recovered mission evidence").waitFor({ timeout: 10_000 });
  await assertControllerHandoffDecisions(page.getByLabel("Recovered mission evidence"), `desktop ${screenshotPrefix} recovery`);
  await assertInterruptedRemoteHandoffExecution(page.getByLabel("Recovered mission evidence"), `desktop ${screenshotPrefix} recovery`, expectedStatus, expectedMessage);
  await assertNoHorizontalOverflow(page, `desktop ${screenshotPrefix} recovery`);
  await page.screenshot({ path: `/tmp/team-ai-agent-h4-${screenshotPrefix}-recovery-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await assertInterruptedRemoteHandoffExecution(page.getByLabel("Recovered mission evidence"), `mobile ${screenshotPrefix} recovery`, expectedStatus, expectedMessage);
  await assertNoHorizontalOverflow(page, `mobile ${screenshotPrefix} recovery`);
  await page.screenshot({ path: `/tmp/team-ai-agent-h4-${screenshotPrefix}-recovery-mobile.png`, fullPage: true });
  await context.close();
}

async function assertInterruptedRemoteHandoffExecution(rootLocator, label, expectedStatus, expectedMessage) {
  const card = rootLocator.getByLabel("Remote handoff execution").first();
  await card.waitFor({ timeout: 10_000 });
  await card.getByRole("heading", { name: /remote handoff execution/i }).waitFor({ timeout: 10_000 });
  await card.getByText(expectedStatus, { exact: true }).first().waitFor({ timeout: 10_000 });
  await card.getByText("Branch push", { exact: true }).waitFor({ timeout: 10_000 });
  await card.getByText("Draft PR", { exact: true }).waitFor({ timeout: 10_000 });
  await card.getByText(expectedMessage).waitFor({ timeout: 10_000 });
  await card.getByText("This action was skipped because a prior remote handoff action did not complete.").waitFor({ timeout: 10_000 });

  const rowCount = await card.locator(".remote-handoff-row").count();
  assert(rowCount === 3, `${label} should render remote handoff execution rows.`);
  const interruptedRows = await card.locator(`.remote-handoff-row.status-${expectedStatus}`).count();
  assert(interruptedRows === 2, `${label} should render gate and branch push rows as ${expectedStatus}.`);
  const skippedRows = await card.locator(".remote-handoff-row.status-skipped").count();
  assert(skippedRows === 1, `${label} should render skipped draft PR row after interrupted branch push.`);
}

async function waitForControllerStatus(page, status, timeoutMs) {
  await page.waitForFunction(
    (expected) => document.querySelector(".mission-controller-card .controller-status")?.textContent?.trim() === expected,
    status,
    { timeout: timeoutMs }
  );
}

async function selectArchivedHistoryRow(page, status) {
  const row = page.locator(".mission-history-row").filter({ hasText: status }).filter({ hasNotText: "Current" }).first();
  await row.waitFor({ timeout: 10_000 });
  await row.click();
}

function git(workspace, args) {
  return run("git", args, { cwd: workspace });
}

function createClock(startIso) {
  let tick = Date.parse(startIso);
  return () => {
    tick += 1000;
    return new Date(tick).toISOString();
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
