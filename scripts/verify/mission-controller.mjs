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
import { MISSION_CONTROLLER_STAGES } from "../../dist/packages/shared/src/index.js";

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
  assert(MISSION_CONTROLLER_STAGES.every((stage) => completed.stageResults.some((item) => item.stage === stage && item.status === "completed")), "Complete path should record every controller stage.");
  assert(completed.reviewerResults.length === 3 && completed.reviewerResults.every((item) => item.decision === "pass"), "Three independent reviewer roles should pass.");
  assert(Boolean(completed.deliveryArtifactContentId), "Complete controller should reference a delivery artifact.");
  assert(completed.currentStage === "handoff_policy", "Complete controller should finish on the handoff policy stage.");
  assert(completed.automationDecisions?.some((decision) => decision.kind === "git_branch_push"), "Complete controller should persist branch push automation decision.");
  assert(completed.automationDecisions?.some((decision) => decision.kind === "force_push" && decision.disabled), "Complete controller should persist hard-disabled force push decision.");
  const completeGitOperations = await completeStack.gitOperationStore.listOperations(missionId);
  assert(["remote_evidence", "branch_push_policy", "draft_pr_policy"].every((kind) => completeGitOperations.some((operation) => operation.kind === kind)), "Complete controller should collect read-only handoff policy Git evidence.");
  assert(completeGitOperations.every((operation) => !["local_commit", "branch_push", "draft_pr_create"].includes(operation.kind)), "Complete controller should not commit, push, or create PRs.");
  const completeSession = await completeStack.missionStore.readSession();
  assert(completeSession.auditEvents.some((event) => event.action === "automation_handoff_execution_skipped"), "Default complete controller should audit skipped remote handoff execution.");

  const autoHandoffStack = createStack("auto-handoff", { autoHandoffGit: true });
  const autoMission = (await autoHandoffStack.missionStore.readSession()).missionId;
  const autoRun = await autoHandoffStack.controllerService.startController({
    missionId: autoMission,
    taskId: "task-controller-auto-handoff",
    command: "Verify bounded remote handoff execution.",
    providerPreference: "deterministic"
  });
  const autoCompleted = await autoHandoffStack.controllerService.waitForTerminalController(autoRun.id, 15_000);
  assert(autoCompleted.status === "completed", `Auto handoff controller should complete, got ${autoCompleted.status}: ${autoCompleted.stopReason?.code ?? "no-code"} ${autoCompleted.stopReason?.message ?? "no-message"}.`);
  assert(autoCompleted.automationDecisions?.some((decision) => decision.kind === "git_branch_push" && decision.canRunAutomatically), "Auto handoff fixture should make branch push eligible.");
  assert(autoCompleted.automationDecisions?.some((decision) => decision.kind === "git_draft_pr_create" && decision.canRunAutomatically), "Auto handoff fixture should make draft PR creation eligible.");
  const autoGitOperations = await autoHandoffStack.gitOperationStore.listOperations(autoMission);
  assert(autoGitOperations.some((operation) => operation.kind === "branch_push" && operation.status === "completed"), "Auto handoff fixture should execute branch push through the Git operation service.");
  assert(autoGitOperations.some((operation) => operation.kind === "draft_pr_create" && operation.status === "completed"), "Auto handoff fixture should execute draft PR creation through the Git operation service.");
  const autoSession = await autoHandoffStack.missionStore.readSession();
  assert(autoSession.auditEvents.some((event) => event.action === "automation_handoff_execution_started"), "Auto handoff fixture should audit execution start.");
  assert(autoSession.auditEvents.some((event) => event.action === "automation_handoff_execution_completed"), "Auto handoff fixture should audit execution completion.");

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
console.log("Paths: complete with handoff policy, auto handoff execution, policy block, retry limit, CI failure, reviewer revision, cancel, recovery.");

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
  const gitOperationService = options.autoHandoffGit
    ? createAutoHandoffGitOperationService(gitOperationStore)
    : new GitOperationService({
      runner: new LocalGitRunner({ workspaceRoot: workspace, allowGitRead: options.allowGitRead ?? true, timeoutMs: 5000 }),
      operationStore: gitOperationStore,
      missionStore,
      artifactStore,
      reviewPacketStore: packetStore
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
  return { missionStore, controllerStore, controllerService, gitOperationStore };
}

function createAutoHandoffGitOperationService(operationStore) {
  let counter = 0;
  const headSha = "a".repeat(40);
  const branchName = "codex/task-controller-auto-handoff";
  const worktree = {
    isRepository: true,
    branch: branchName,
    headSha,
    isClean: true,
    hasDeniedChanges: false,
    files: [{ path: "src/feature.ts", indexStatus: "M", worktreeStatus: " ", kind: "modified", isDenied: false }],
    summary: "Auto handoff fixture worktree is clean on codex branch.",
    checkedAt: new Date().toISOString()
  };
  const diff = {
    changedFiles: 1,
    insertions: 1,
    deletions: 0,
    files: [{ path: "src/feature.ts", insertions: 1, deletions: 0, status: "modified", isDenied: false }],
    clipped: false
  };
  const commitPlan = {
    branchName,
    commitMessage: "Update auto handoff fixture",
    summary: "Commit plan is ready for auto handoff fixture evidence.",
    changedFiles: ["src/feature.ts"],
    requiredEvidence: ["Test run evidence", "Reviewer approval"],
    risks: ["Fixture-only remote handoff path."],
    reviewers: ["tech_lead", "automation_qa"],
    ready: true
  };

  return {
    getPolicy: () => ({
      schemaVersion: 1,
      workspaceRoot: workspace,
      allowedWorkspaceRoots: [workspace],
      allowGitRead: true,
      allowRemoteRead: true,
      allowGitCommit: false,
      allowRemotePush: true,
      allowPullRequestCreate: true,
      timeoutMs: 5000,
      maxDiffBytes: 80_000,
      deniedPathPatterns: [".env", ".data", "node_modules", "dist"]
    }),
    executeOperation: async (input) => {
      const now = new Date().toISOString();
      const id = `git-auto-${++counter}-${input.kind}`;
      const result = gitResultForAutoHandoff(input.kind, {
        branchName: input.branchName ?? branchName,
        commitPlan,
        diff,
        headSha,
        worktree
      });
      const record = {
        schemaVersion: 1,
        id,
        missionId: input.missionId,
        taskId: input.taskId,
        roleId: input.roleId,
        kind: input.kind,
        status: "completed",
        policy: { allowed: true, normalizedCwd: workspace, reason: "Auto handoff fixture policy allowed." },
        result,
        requestedAt: now,
        startedAt: now,
        completedAt: now,
        updatedAt: now
      };
      return operationStore.upsertOperation(record);
    }
  };
}

function gitResultForAutoHandoff(kind, fixture) {
  const base = {
    durationMs: 1,
    worktree: fixture.worktree
  };
  if (kind === "status") {
    return {
      ...base,
      summary: fixture.worktree.summary,
      evidence: [`Branch: ${fixture.worktree.branch}`, `HEAD: ${fixture.worktree.headSha}`]
    };
  }
  if (kind === "diff") {
    return {
      ...base,
      summary: "Git diff has 1 changed file for auto handoff fixture.",
      evidence: ["src/feature.ts: +1/-0"],
      diff: fixture.diff
    };
  }
  if (kind === "commit_plan") {
    return {
      ...base,
      summary: fixture.commitPlan.summary,
      evidence: [`Branch proposal: ${fixture.commitPlan.branchName}`, "Ready: true"],
      diff: fixture.diff,
      commitPlan: fixture.commitPlan
    };
  }
  if (kind === "remote_evidence") {
    return {
      ...base,
      summary: `${fixture.branchName} is published and current.`,
      evidence: [`Branch: ${fixture.branchName}`, "Publication: published_current"],
      remoteEvidence: {
        remoteName: "origin",
        provider: "github",
        repository: "phetjaaeiei/AI-Agent",
        branchName: fixture.branchName,
        defaultBranch: "main",
        localCommitSha: fixture.headSha,
        remoteCommitSha: fixture.headSha,
        publicationState: "published_current",
        pullRequest: { state: "none", summary: "No draft PR exists yet." },
        checks: { state: "passing", total: 1, passed: 1, pending: 0, failed: 0, summary: "1 passing check." },
        blockedActions: ["Merge remains a human decision.", "Deployment and production actions are disabled.", "Force push is disabled.", "Branch deletion is disabled."],
        retryable: false,
        checkedAt: new Date().toISOString(),
        summary: `${fixture.branchName} is published and current.`
      }
    };
  }
  if (kind === "branch_push_policy" || kind === "draft_pr_policy") {
    const mutationKind = kind === "branch_push_policy" ? "branch_push" : "draft_pr";
    return {
      ...base,
      summary: `${mutationKind} policy preflight passed.`,
      evidence: [`Mutation: ${mutationKind}`, `Branch: ${fixture.branchName}`, "Reviewed delivery present: true"],
      diff: fixture.diff,
      commitPlan: fixture.commitPlan,
      remoteMutationPolicy: {
        mutationKind,
        allowed: true,
        reason: `${mutationKind} policy preflight passed with reviewed delivery evidence.`,
        actorRoleId: "release_manager",
        branchName: fixture.branchName,
        commitSha: fixture.headSha,
        remoteName: "origin",
        remoteTarget: "phetjaaeiei/AI-Agent",
        baseBranch: "main",
        permissionAllowed: true,
        reviewedDeliveryRequired: true,
        reviewedDeliveryPresent: true,
        reviewPacketId: "fixture-review-packet",
        deliveryArtifactContentId: "fixture-delivery",
        forcePushAllowed: false,
        branchDeletionAllowed: false,
        blockers: [],
        checkedAt: new Date().toISOString()
      }
    };
  }
  if (kind === "branch_push") {
    return {
      ...base,
      summary: `Pushed ${fixture.branchName} to origin at ${fixture.headSha.slice(0, 12)}.`,
      evidence: [`Remote: origin`, `Branch: ${fixture.branchName}`, "Force push: disabled", "Branch deletion: disabled"],
      branchPush: {
        remoteName: "origin",
        branchName: fixture.branchName,
        commitSha: fixture.headSha,
        remoteTarget: "phetjaaeiei/AI-Agent",
        trackingBranch: `origin/${fixture.branchName}`,
        pushedAt: new Date().toISOString(),
        summary: `Pushed ${fixture.branchName}.`
      }
    };
  }
  if (kind === "draft_pr_create") {
    return {
      ...base,
      summary: `Created draft PR for ${fixture.branchName} into main.`,
      evidence: [`Head: ${fixture.branchName}`, "Draft: true", "Merge: manual"],
      draftPullRequest: {
        url: "https://github.com/phetjaaeiei/AI-Agent/pull/456",
        number: 456,
        title: "Draft PR: Auto handoff fixture",
        body: "## Verification\nFixture reviewed delivery.\n\n## Remote Safety\nMerge remains manual.",
        baseBranch: "main",
        headBranch: fixture.branchName,
        remoteTarget: "phetjaaeiei/AI-Agent",
        draft: true,
        createdAt: new Date().toISOString(),
        summary: `Created draft PR for ${fixture.branchName}.`
      }
    };
  }
  throw new Error(`Unsupported auto handoff Git fixture operation: ${kind}`);
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
