import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createDefaultOrchestratorArtifactContents } from "../../dist/apps/orchestrator/src/fixtures.js";
import { createDefaultOrchestratorSession } from "../../dist/apps/orchestrator/src/fixtures.js";
import { FileArtifactContentStore } from "../../dist/apps/orchestrator/src/artifact-content-store.js";
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";
import { DeterministicAgentExecutor, DeterministicReviewExecutor } from "../../dist/packages/agent-core/src/index.js";
import { AgentRunEventBroker } from "../../dist/apps/orchestrator/src/agent-run-events.js";
import { AgentRunService } from "../../dist/apps/orchestrator/src/agent-run-service.js";
import { FileAgentRunStore } from "../../dist/apps/orchestrator/src/agent-run-store.js";
import { ToolCallService } from "../../dist/apps/orchestrator/src/tool-call-service.js";
import { FileToolCallStore } from "../../dist/apps/orchestrator/src/tool-call-store.js";
import { LocalToolRunner } from "../../dist/packages/tool-runner/src/index.js";
import { GitOperationService } from "../../dist/apps/orchestrator/src/git-operation-service.js";
import { FileGitOperationStore } from "../../dist/apps/orchestrator/src/git-operation-store.js";
import { LocalGitRunner } from "../../dist/packages/git-runner/src/index.js";
import { ReviewPacketService } from "../../dist/apps/orchestrator/src/review-packet-service.js";
import { FileReviewPacketStore } from "../../dist/apps/orchestrator/src/review-packet-store.js";
import { MissionControllerService } from "../../dist/apps/orchestrator/src/mission-controller-service.js";
import { FileMissionControllerStore } from "../../dist/apps/orchestrator/src/mission-controller-store.js";
import { createOrchestratorServer } from "../../dist/apps/orchestrator/src/server.js";

const failures = [];
const run = promisify(execFile);

const assert = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const tempDir = await mkdtemp(join(tmpdir(), "team-ai-agent-orchestrator-"));
const storePath = join(tempDir, "mission-session.json");
const artifactStorePath = join(tempDir, "mission-artifacts.json");
const runStorePath = join(tempDir, "agent-runs.json");
const toolCallStorePath = join(tempDir, "tool-calls.json");
const gitOperationStorePath = join(tempDir, "git-operations.json");
const reviewPacketStorePath = join(tempDir, "review-packets.json");
const missionControllerStorePath = join(tempDir, "mission-controllers.json");
const workspacePath = join(tempDir, "workspace");
const remotePath = join(tempDir, "workspace-origin.git");
await mkdir(join(workspacePath, "docs"), { recursive: true });
await writeFile(join(workspacePath, "docs", "plan.md"), "# Plan\n\nLocal tool evidence.\n", "utf8");
await writeFile(join(workspacePath, ".env"), "SECRET=not-real\n", "utf8");
await git(["init"]);
await git(["config", "user.name", "Team AI Agent"]);
await git(["config", "user.email", "team-ai-agent@example.local"]);
await git(["add", "docs/plan.md"]);
await git(["commit", "-m", "Initial plan"]);
await git(["branch", "-M", "main"]);
await run("git", ["init", "--bare", remotePath]);
await run("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: remotePath });
await git(["remote", "add", "origin", remotePath]);
await git(["push", "-u", "origin", "main"]);
const store = new FileMissionStore(storePath, () => createDefaultOrchestratorSession("2026-06-18T10:00:00.000Z"));
const artifactStore = new FileArtifactContentStore(artifactStorePath, () =>
  createDefaultOrchestratorArtifactContents("2026-06-18T10:00:00.000Z")
);
const runStore = new FileAgentRunStore(runStorePath);
const toolCallStore = new FileToolCallStore(toolCallStorePath);
const gitOperationStore = new FileGitOperationStore(gitOperationStorePath);
const reviewPacketStore = new FileReviewPacketStore(reviewPacketStorePath);
const missionControllerStore = new FileMissionControllerStore(missionControllerStorePath);
const eventBroker = new AgentRunEventBroker();
const runService = new AgentRunService({
  executor: new DeterministicAgentExecutor(),
  runtimeInfo: async () => ({ configuredMode: "deterministic", activeProvider: "deterministic", ollamaAvailable: false, ollamaBaseUrl: "http://127.0.0.1:11434", model: "qwen3:8b", modelAvailable: false, message: "Verification fixture" }),
  runStore,
  missionStore: store,
  artifactStore,
  eventBroker,
  timeoutMs: 1000
});
const toolCallService = new ToolCallService({
  runner: new LocalToolRunner({ workspaceRoot: workspacePath, timeoutMs: 5000 }),
  toolCallStore,
  missionStore: store,
  artifactStore,
  now: () => "2026-06-18T10:31:00.000Z"
});
const gitOperationService = new GitOperationService({
  runner: new LocalGitRunner({ workspaceRoot: workspacePath, timeoutMs: 5000 }),
  operationStore: gitOperationStore,
  missionStore: store,
  artifactStore,
  reviewPacketStore,
  now: () => "2026-06-18T10:32:00.000Z"
});
const reviewPacketService = new ReviewPacketService({
  packetStore: reviewPacketStore,
  missionStore: store,
  artifactStore,
  toolCallStore,
  gitOperationStore,
  toolCallService,
  now: () => "2026-06-18T10:33:00.000Z"
});
const missionControllerService = new MissionControllerService({
  controllerStore: missionControllerStore,
  missionStore: store,
  agentRunService: runService,
  toolCallService,
  gitOperationService,
  reviewPacketService,
  reviewer: new DeterministicReviewExecutor(),
  now: () => "2026-06-18T10:34:00.000Z"
});
const server = createOrchestratorServer({
  store,
  artifactStore,
  runStore,
  toolCallStore,
  gitOperationStore,
  reviewPacketStore,
  missionControllerStore,
  runService,
  toolCallService,
  gitOperationService,
  reviewPacketService,
  missionControllerService,
  now: () => "2026-06-18T10:30:00.000Z"
});
const address = await new Promise((resolveAddress) => {
  server.listen(0, "127.0.0.1", () => resolveAddress(server.address()));
});
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const health = await requestJson(`${baseUrl}/health`);
  assert(health.status === "ok", "Health endpoint should return ok.");
  assert(health.agentRuntime.activeProvider === "deterministic", "Health endpoint should expose agent runtime mode.");

  const runtimeInfo = await requestJson(`${baseUrl}/api/mission/agent-runtime`);
  assert(runtimeInfo.model === "qwen3:8b", "Agent runtime endpoint should expose the configured model.");

  const toolPolicy = await requestJson(`${baseUrl}/api/mission/tool-policy`);
  assert(toolPolicy.workspaceRoot === workspacePath, "Tool policy endpoint should expose the configured local workspace.");
  assert(toolPolicy.deniedPathPatterns.includes(".env"), "Tool policy endpoint should expose denied secret path patterns.");

  const gitPolicy = await requestJson(`${baseUrl}/api/mission/git-policy`);
  assert(gitPolicy.workspaceRoot === workspacePath, "Git policy endpoint should expose the configured local workspace.");
  assert(gitPolicy.allowRemoteRead === true, "Git policy should allow read-only remote health by default.");
  assert(gitPolicy.allowGitCommit === false, "Git policy should block local commits by default.");
  assert(gitPolicy.allowPullRequestCreate === false, "Git policy should block PR creation by default.");

  const initialSession = await requestJson(`${baseUrl}/api/mission/session`);
  assert(initialSession.schemaVersion === 1, "Session endpoint should return schema version 1.");
  assert(initialSession.runtime.autopilotCursor === 0, "Initial session should start at autopilot cursor 0.");
  assert(initialSession.artifactRecords.length === 5, "Initial session should include seed artifact records.");
  assert(initialSession.auditEvents.length === 1, "Initial session should include one seed audit event.");
  assert(initialSession.missionAssumptions.length === 1, "Initial session should include one saved mission assumption.");
  assert(initialSession.assumptionDraft.includes("Sales API"), "Initial session should expose editable assumption draft text.");

  const initialArtifacts = await requestJson(`${baseUrl}/api/mission/artifacts`);
  assert(initialArtifacts.length === 5, "Artifacts endpoint should return seed artifact contents.");
  assert(initialArtifacts[0].format === "markdown", "Artifact content should be stored as markdown.");
  assert(initialArtifacts[0].sections.length >= 4, "Artifact content should include structured sections.");

  const commandDraft = "Build customer portal with API data, browser tests, staging deploy, success metrics, and repository demo/app.";
  const advance = await requestJson(`${baseUrl}/api/mission/autopilot`, {
    method: "POST",
    body: JSON.stringify({ commandDraft })
  });
  assert(advance.advancedTaskId === "task-acceptance-handoff", "Autopilot should advance the first task.");
  assert(advance.activeRouteId === "route-acceptance-to-tech", "Autopilot should advance the first route.");
  assert(advance.snapshot.commandDraft === commandDraft, "Autopilot should persist the command draft.");
  assert(advance.snapshot.runtime.autopilotCursor === 1, "Autopilot should increment cursor.");
  assert(advance.snapshot.runtime.activeRouteIndex === 1, "Autopilot should advance active route index.");
  assert(advance.snapshot.artifactRecords.length === 6, "Autopilot should append an artifact record.");
  assert(advance.snapshot.auditEvents.length === 2, "Autopilot should append an audit event.");
  assert(advance.snapshot.missionAssumptions.length === 1, "Autopilot should preserve mission assumptions.");
  assert(advance.artifactContent.artifactId === "art-acceptance", "Autopilot should return generated artifact content.");
  assert(advance.artifactContent.markdown.includes("Acceptance matrix handoff"), "Artifact markdown should include handoff context.");

  const afterAdvance = await requestJson(`${baseUrl}/api/mission/session`);
  assert(afterAdvance.runtime.autopilotCursor === 1, "Session endpoint should return persisted cursor.");
  assert(afterAdvance.commandDraft === commandDraft, "Session endpoint should return persisted command.");

  const afterAdvanceArtifacts = await requestJson(`${baseUrl}/api/mission/artifacts`);
  assert(afterAdvanceArtifacts.length === 6, "Artifacts endpoint should include generated autopilot content.");
  assert(afterAdvanceArtifacts[0].id === advance.artifactContent.id, "Latest generated content should be first.");

  const artifactById = await requestJson(`${baseUrl}/api/mission/artifacts/${encodeURIComponent(advance.artifactContent.id)}`);
  assert(artifactById.id === advance.artifactContent.id, "Artifact detail endpoint should fetch content by id.");

  const startedRun = await requestJson(`${baseUrl}/api/mission/agent-runs`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      command: "Plan a local dashboard with repository evidence.",
      idempotencyKey: "orchestrator-agent-run-1",
      providerPreference: "deterministic"
    })
  });
  assert(startedRun.status === "queued", "Agent run endpoint should return a queued run with 202 semantics.");
  const completedRun = await waitForRun(`${baseUrl}/api/mission/agent-runs/${startedRun.id}`);
  assert(completedRun.status === "completed", "Agent run should complete through the HTTP service boundary.");
  assert(completedRun.verification.decision === "pass", "Agent run should include independent verification.");
  const listedRuns = await requestJson(`${baseUrl}/api/mission/agent-runs?missionId=${encodeURIComponent(initialSession.missionId)}`);
  assert(listedRuns[0].id === startedRun.id, "Agent run list should return the latest mission run.");
  const runEvents = await readFirstSseChunk(`${baseUrl}/api/mission/agent-runs/${startedRun.id}/events`);
  assert(runEvents.includes("event: agent-run"), "Agent run event endpoint should stream SSE events.");
  assert(runEvents.includes("Mission planning queued"), "SSE history should include the queued event.");

  const readToolCall = await requestJson(`${baseUrl}/api/mission/tool-calls`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-tool-read",
      roleId: "tech_lead",
      kind: "file_read",
      targetPath: "docs/plan.md"
    })
  });
  assert(readToolCall.status === "completed", "Tool call endpoint should complete a local file read.");
  assert(readToolCall.result.stdout.includes("Local tool evidence"), "Tool read response should include clipped file content.");
  const writeToolCall = await requestJson(`${baseUrl}/api/mission/tool-calls`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-tool-write",
      roleId: "frontend_developer",
      kind: "file_write",
      targetPath: "docs/generated.md",
      content: "# Generated\n\nPatch evidence.\n"
    })
  });
  assert(writeToolCall.status === "completed", "Tool call endpoint should complete a local file write.");
  assert(writeToolCall.artifactContentId, "Tool write should create a patch artifact through the HTTP boundary.");
  const blockedToolCall = await requestJson(`${baseUrl}/api/mission/tool-calls`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-tool-secret",
      roleId: "security_engineer",
      kind: "file_read",
      targetPath: ".env"
    })
  });
  assert(blockedToolCall.status === "blocked" && blockedToolCall.errorCode === "secret_path", "Tool endpoint should block secret paths.");
  const fetchedToolCall = await requestJson(`${baseUrl}/api/mission/tool-calls/${encodeURIComponent(writeToolCall.id)}`);
  assert(fetchedToolCall.id === writeToolCall.id, "Tool call detail endpoint should fetch by id.");
  const listedToolCalls = await requestJson(`${baseUrl}/api/mission/tool-calls?missionId=${encodeURIComponent(initialSession.missionId)}`);
  assert(listedToolCalls.length === 3, "Tool call list endpoint should return mission tool calls.");

  const gitStatus = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-status",
      roleId: "tech_lead",
      kind: "status"
    })
  });
  assert(gitStatus.status === "completed", "Git status endpoint should complete in a local repository.");
  assert(gitStatus.result.worktree.hasDeniedChanges === true, "Git status should flag denied path changes.");
  const gitDiff = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-diff",
      roleId: "tech_lead",
      kind: "diff"
    })
  });
  assert(gitDiff.status === "completed", "Git diff endpoint should complete.");
  assert(gitDiff.artifactContentId, "Git diff should create evidence artifact through the HTTP boundary.");
  assert(!gitDiff.result.diff.diff.includes("SECRET=not-real"), "Git diff should not expose denied secret content.");
  const gitPlan = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-plan",
      roleId: "tech_lead",
      kind: "commit_plan",
      baseBranch: "main"
    })
  });
  assert(gitPlan.status === "completed", "Git commit-plan endpoint should complete.");
  assert(gitPlan.result.commitPlan.ready === false, "Git commit-plan should block readiness when denied changes exist.");
  const gitPrDraft = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-pr",
      roleId: "tech_lead",
      kind: "pr_draft",
      baseBranch: "main"
    })
  });
  assert(gitPrDraft.result.prDraft.status === "integration_needed", "PR draft should remain offline when PR creation is disabled.");
  const gitRemoteHealth = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-remote-health",
      roleId: "devops_lead",
      kind: "remote_health",
      baseBranch: "main"
    })
  });
  assert(gitRemoteHealth.status === "completed", "Git remote-health endpoint should complete.");
  assert(gitRemoteHealth.result.remoteHealth.access === "ok", "Git remote-health endpoint should report reachable origin access.");
  assert(gitRemoteHealth.artifactContentId, "Git remote-health should create evidence artifact through the HTTP boundary.");
  const gitRemoteEvidence = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-remote-evidence",
      roleId: "release_manager",
      kind: "remote_evidence",
      baseBranch: "main",
      branchName: "main"
    })
  });
  assert(gitRemoteEvidence.status === "completed", "Git remote evidence endpoint should complete.");
  assert(gitRemoteEvidence.result.remoteEvidence.publicationState === "published_current", "Git remote evidence should compare local and remote branch commits.");
  assert(gitRemoteEvidence.result.remoteEvidence.blockedActions.some((item) => item.includes("Merge")), "Git remote evidence should keep merge blocked.");
  assert(gitRemoteEvidence.artifactContentId, "Git remote evidence should create artifact evidence through the HTTP boundary.");
  const gitBranchPushPolicy = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-branch-push-policy",
      roleId: "release_manager",
      kind: "branch_push_policy",
      baseBranch: "main",
      branchName: "codex/http-policy"
    })
  });
  assert(gitBranchPushPolicy.status === "completed", "Branch push policy endpoint should complete without pushing.");
  assert(gitBranchPushPolicy.result.remoteMutationPolicy.allowed === false, "Branch push policy endpoint should stay blocked by default.");
  assert(gitBranchPushPolicy.result.remoteMutationPolicy.blockers.some((item) => item.includes("Explicit reviewPacketId")), "Branch push policy should require explicit reviewed delivery evidence.");
  assert(gitBranchPushPolicy.result.remoteMutationPolicy.forcePushAllowed === false, "Branch push policy should keep force push disabled.");
  assert(gitBranchPushPolicy.result.remoteMutationPolicy.branchDeletionAllowed === false, "Branch push policy should keep branch deletion disabled.");
  const gitDraftPrPolicy = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-draft-pr-policy",
      roleId: "release_manager",
      kind: "draft_pr_policy",
      baseBranch: "main",
      branchName: "codex/http-policy"
    })
  });
  assert(gitDraftPrPolicy.status === "completed", "Draft PR policy endpoint should complete without creating a PR.");
  assert(gitDraftPrPolicy.result.remoteMutationPolicy.allowed === false, "Draft PR policy endpoint should stay blocked by default.");
  assert(gitDraftPrPolicy.result.remoteMutationPolicy.blockers.some((item) => item.includes("Draft PR creation is disabled")), "Draft PR policy should record disabled PR permission.");
  const blockedBranchPush = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-branch-push",
      roleId: "release_manager",
      kind: "branch_push",
      baseBranch: "main",
      branchName: "codex/http-policy"
    })
  });
  assert(blockedBranchPush.status === "blocked" && blockedBranchPush.errorCode === "remote_disabled", "Branch push endpoint should be blocked by default.");
  const blockedDraftPrCreate = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-draft-pr-create",
      roleId: "release_manager",
      kind: "draft_pr_create",
      baseBranch: "main",
      branchName: "codex/http-policy"
    })
  });
  assert(blockedDraftPrCreate.status === "blocked" && blockedDraftPrCreate.errorCode === "remote_disabled", "Draft PR creation endpoint should be blocked by default.");
  const blockedGitCommit = await requestJson(`${baseUrl}/api/mission/git-operations`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-git-commit",
      roleId: "tech_lead",
      kind: "local_commit"
    })
  });
  assert(blockedGitCommit.status === "blocked" && blockedGitCommit.errorCode === "commit_disabled", "Local Git commit endpoint should be blocked by default.");
  const fetchedGitOperation = await requestJson(`${baseUrl}/api/mission/git-operations/${encodeURIComponent(gitPlan.id)}`);
  assert(fetchedGitOperation.id === gitPlan.id, "Git operation detail endpoint should fetch by id.");
  const listedGitOperations = await requestJson(`${baseUrl}/api/mission/git-operations?missionId=${encodeURIComponent(initialSession.missionId)}`);
  assert(listedGitOperations.length === 11, "Git operation list endpoint should return mission Git operations.");

  const reviewPacket = await requestJson(`${baseUrl}/api/mission/review-packets`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-review-packet",
      roleId: "tech_lead"
    })
  });
  assert(reviewPacket.status === "blocked", "Denied Git changes should block a newly created review packet.");
  assert(reviewPacket.requirements.some((item) => item.id === "changed_files" && item.status === "block"), "Review packet should explain the denied-path block.");
  const listedReviewPackets = await requestJson(`${baseUrl}/api/mission/review-packets?missionId=${encodeURIComponent(initialSession.missionId)}`);
  assert(listedReviewPackets[0].id === reviewPacket.id, "Review packet list should return the latest packet.");
  const fetchedReviewPacket = await requestJson(`${baseUrl}/api/mission/review-packets/${encodeURIComponent(reviewPacket.id)}`);
  assert(fetchedReviewPacket.id === reviewPacket.id, "Review packet detail endpoint should fetch by id.");
  const reviewedPacket = await requestJson(`${baseUrl}/api/mission/review-packets/${encodeURIComponent(reviewPacket.id)}/reviews`, {
    method: "POST",
    body: JSON.stringify({ reviewerRoleId: "tech_lead", decision: "pass", summary: "Local evidence reviewed." })
  });
  assert(reviewedPacket.reviews[0].reviewerRoleId === "tech_lead", "Review endpoint should persist a role-aware decision.");
  const refreshedPacket = await requestJson(`${baseUrl}/api/mission/review-packets/${encodeURIComponent(reviewPacket.id)}/refresh`, { method: "POST" });
  assert(refreshedPacket.status === "blocked", "Refresh should deterministically preserve evidence blocks.");
  const deliveryPacket = await requestJson(`${baseUrl}/api/mission/review-packets/${encodeURIComponent(reviewPacket.id)}/delivery`, { method: "POST" });
  assert(deliveryPacket.deliveryArtifactContentId, "Delivery endpoint should generate offline Markdown even for a blocked packet.");
  assert(deliveryPacket.status === "blocked", "A draft delivery report must not bypass readiness gates.");

  const missionController = await requestJson(`${baseUrl}/api/mission/controllers`, {
    method: "POST",
    body: JSON.stringify({
      missionId: initialSession.missionId,
      taskId: "task-controller-http",
      command: "Run a local autonomous mission.",
      idempotencyKey: "controller-http-1",
      providerPreference: "deterministic"
    })
  });
  assert(missionController.status === "queued", "Mission controller endpoint should return a queued controller.");
  const cancelledController = await requestJson(`${baseUrl}/api/mission/controllers/${encodeURIComponent(missionController.id)}/cancel`, { method: "POST" });
  assert(cancelledController.status === "cancelled", "Mission controller cancel endpoint should stop queued work.");
  const fetchedController = await requestJson(`${baseUrl}/api/mission/controllers/${encodeURIComponent(missionController.id)}`);
  assert(fetchedController.id === missionController.id, "Mission controller detail endpoint should fetch by id.");
  const listedControllers = await requestJson(`${baseUrl}/api/mission/controllers?missionId=${encodeURIComponent(initialSession.missionId)}`);
  assert(listedControllers[0].id === missionController.id, "Mission controller list endpoint should return mission controllers.");

  const saved = await requestJson(`${baseUrl}/api/mission/session`, {
    method: "PUT",
    body: JSON.stringify({
      ...afterAdvance,
      commandDraft: "Manual save from verification.",
      assumptionDraft: "Repository verification workspace remains local.",
      missionAssumptions: [{
        id: "assumption-verification-local",
        missionId: initialSession.missionId,
        assumption: "Repository verification workspace remains local.",
        source: "Verification intake",
        ambiguityClass: "low",
        confidence: 90,
        impact: "Remote mutation remains disabled.",
        ownerRoleId: "lead_ba",
        reviewStatus: "open",
        createdAt: "2026-06-18T10:35:00.000Z"
      }]
    })
  });
  assert(saved.commandDraft === "Manual save from verification.", "PUT session should persist valid snapshots.");
  assert(saved.missionAssumptions[0].assumption.includes("remains local"), "PUT session should persist mission assumptions.");

  const rejected = await fetch(`${baseUrl}/api/mission/session`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schemaVersion: 999 })
  });
  assert(rejected.status === 400, "PUT session should reject invalid schema.");

  const reset = await requestJson(`${baseUrl}/api/mission/reset`, { method: "POST" });
  assert(reset.runtime.autopilotCursor === 0, "Reset should restore autopilot cursor.");
  assert(reset.commandDraft.includes("Build sales analytics dashboard"), "Reset should restore default command.");
  assert(reset.missionAssumptions.length === 1, "Reset should restore the default mission assumption.");
  const resetArtifacts = await requestJson(`${baseUrl}/api/mission/artifacts`);
  assert(resetArtifacts.length === 5, "Reset should restore seed artifact contents.");
  assert((await requestJson(`${baseUrl}/api/mission/agent-runs`)).length === 0, "Reset should clear agent run history.");
  assert((await requestJson(`${baseUrl}/api/mission/tool-calls`)).length === 0, "Reset should clear tool call history.");
  assert((await requestJson(`${baseUrl}/api/mission/git-operations`)).length === 0, "Reset should clear Git operation history.");
  assert((await requestJson(`${baseUrl}/api/mission/review-packets`)).length === 0, "Reset should clear review packet history.");
  assert((await requestJson(`${baseUrl}/api/mission/controllers`)).length === 0, "Reset should clear mission controller history.");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Orchestrator verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Orchestrator verification passed.");
console.log(`Base URL tested: ${baseUrl}`);

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${url} failed with ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function git(args) {
  return run("git", args, { cwd: workspacePath });
}

async function waitForRun(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = await requestJson(url);
    if (["completed", "blocked", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function readFirstSseChunk(url) {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  const reader = response.body.getReader();
  const { value } = await reader.read();
  controller.abort();
  return new TextDecoder().decode(value);
}
