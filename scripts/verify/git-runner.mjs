import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { LocalGitRunner } from "../../dist/packages/git-runner/src/index.js";
import { GitOperationService } from "../../dist/apps/orchestrator/src/git-operation-service.js";
import { FileGitOperationStore } from "../../dist/apps/orchestrator/src/git-operation-store.js";
import { FileArtifactContentStore } from "../../dist/apps/orchestrator/src/artifact-content-store.js";
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";
import { createDefaultOrchestratorArtifactContents, createDefaultOrchestratorSession } from "../../dist/apps/orchestrator/src/fixtures.js";

const run = promisify(execFile);
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const tempDir = await mkdtemp(join(tmpdir(), "team-ai-agent-git-"));
const repo = join(tempDir, "repo");
const remote = join(tempDir, "origin.git");

async function git(args) {
  return run("git", args, { cwd: repo });
}

function createNow() {
  let index = 0;
  return () => `2026-06-19T13:${String(index++).padStart(2, "0")}:00.000Z`;
}

try {
  await mkdir(join(repo, "src"), { recursive: true });
  await mkdir(join(repo, "docs"), { recursive: true });
  await git(["init"]);
  await git(["config", "user.name", "Team AI Agent"]);
  await git(["config", "user.email", "team-ai-agent@example.local"]);
  await writeFile(join(repo, "README.md"), "# Fixture\n", "utf8");
  await writeFile(join(repo, "src", "app.ts"), "export const answer = 41;\n", "utf8");
  await git(["add", "README.md", "src/app.ts"]);
  await git(["commit", "-m", "Initial fixture"]);
  await git(["branch", "-M", "main"]);
  await run("git", ["init", "--bare", remote]);
  await run("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: remote });
  await git(["remote", "add", "origin", remote]);
  await git(["push", "-u", "origin", "main"]);

  await writeFile(join(repo, "src", "app.ts"), "export const answer = 42;\n", "utf8");
  await writeFile(join(repo, "docs", "new.md"), "# New evidence\n", "utf8");
  await writeFile(join(repo, ".env"), "SECRET_VALUE=do-not-save\n", "utf8");

  const missionStore = new FileMissionStore(join(tempDir, "session.json"), () => createDefaultOrchestratorSession("2026-06-19T13:00:00.000Z"));
  const artifactStore = new FileArtifactContentStore(join(tempDir, "artifacts.json"), () =>
    createDefaultOrchestratorArtifactContents("2026-06-19T13:00:00.000Z")
  );
  const operationStore = new FileGitOperationStore(join(tempDir, "git-operations.json"));
  const service = new GitOperationService({
    runner: new LocalGitRunner({ workspaceRoot: repo, timeoutMs: 5000 }),
    operationStore,
    missionStore,
    artifactStore,
    now: createNow()
  });

  const policy = service.getPolicy();
  assert(policy.allowGitRead === true, "Git reads should be enabled by default.");
  assert(policy.allowRemoteRead === true, "Git remote reads should be enabled by default.");
  assert(policy.allowGitCommit === false, "Local Git commits should be disabled by default.");
  assert(policy.allowRemotePush === false, "Remote branch push should be disabled by default.");
  assert(policy.allowPullRequestCreate === false, "PR creation should be disabled by default.");

  const status = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-status",
    roleId: "tech_lead",
    kind: "status"
  });
  assert(status.status === "completed", "Git status should complete inside a repository.");
  assert(status.result?.worktree?.files.length === 3, "Git status should include modified, untracked, and denied files.");
  assert(status.result?.worktree?.hasDeniedChanges === true, "Git status should flag denied path changes.");

  const diff = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-diff",
    roleId: "tech_lead",
    kind: "diff"
  });
  assert(diff.status === "completed", "Git diff should complete.");
  assert(diff.result?.diff?.changedFiles >= 2, "Git diff summary should include tracked and untracked status changes.");
  assert(!diff.result?.diff?.diff?.includes("SECRET_VALUE"), "Git diff output should not expose denied secret content.");
  assert(diff.artifactContentId, "Git diff should create evidence artifact.");

  const commitPlan = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-plan",
    roleId: "tech_lead",
    kind: "commit_plan",
    baseBranch: "main"
  });
  assert(commitPlan.status === "completed", "Commit plan should complete even when blocked by denied changes.");
  assert(commitPlan.result?.commitPlan?.ready === false, "Commit plan should not be ready with denied changes.");
  assert(commitPlan.artifactContentId, "Commit plan should create an artifact.");

  const prDraft = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-pr",
    roleId: "tech_lead",
    kind: "pr_draft",
    baseBranch: "main"
  });
  assert(prDraft.status === "completed", "PR draft should be created offline.");
  assert(prDraft.result?.prDraft?.status === "integration_needed", "PR draft should not claim remote creation is ready by default.");

  const remoteHealth = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-remote-health",
    roleId: "devops_lead",
    kind: "remote_health",
    baseBranch: "main"
  });
  assert(remoteHealth.status === "completed", "Remote health should complete with a configured origin.");
  assert(remoteHealth.result?.remoteHealth?.access === "ok", "Remote health should report reachable origin access.");
  assert(remoteHealth.result?.remoteHealth?.defaultBranch === "main", "Remote health should read the default branch.");
  assert(remoteHealth.result?.remoteHealth?.remoteHeadSha, "Remote health should record a remote HEAD SHA.");
  assert(remoteHealth.artifactContentId, "Remote health should create an evidence artifact.");

  const remoteEvidence = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-remote-evidence",
    roleId: "release_manager",
    kind: "remote_evidence",
    baseBranch: "main",
    branchName: "main"
  });
  assert(remoteEvidence.status === "completed", "Remote evidence should complete without mutating the remote.");
  assert(remoteEvidence.result?.remoteEvidence?.publicationState === "published_current", "Remote evidence should compare local and remote branch commits.");
  assert(remoteEvidence.result?.remoteEvidence?.pullRequest.state === "none", "Local bare remotes should report no PR evidence.");
  assert(remoteEvidence.result?.remoteEvidence?.blockedActions.some((item) => item.includes("Merge")), "Remote evidence should keep merge blocked.");
  assert(remoteEvidence.artifactContentId, "Remote evidence should create an evidence artifact.");

  const branchPushPolicy = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-branch-push-policy",
    roleId: "release_manager",
    kind: "branch_push_policy",
    baseBranch: "main",
    branchName: "codex/fixture-policy"
  });
  assert(branchPushPolicy.status === "completed", "Branch push policy preflight should complete without mutating the remote.");
  assert(branchPushPolicy.result?.remoteMutationPolicy?.allowed === false, "Branch push policy should be blocked by default.");
  assert(branchPushPolicy.result?.remoteMutationPolicy?.forcePushAllowed === false, "Branch push policy should keep force push disabled.");
  assert(branchPushPolicy.result?.remoteMutationPolicy?.branchDeletionAllowed === false, "Branch push policy should keep branch deletion disabled.");
  assert(branchPushPolicy.result?.remoteMutationPolicy?.blockers.some((item) => item.includes("Branch push is disabled")), "Branch push policy should record disabled push permission.");
  assert(branchPushPolicy.result?.remoteMutationPolicy?.blockers.some((item) => item.includes("Review packet store")), "Branch push policy should require reviewed delivery evidence.");
  assert(branchPushPolicy.artifactContentId, "Branch push policy should create an evidence artifact.");

  const draftPrPolicy = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-draft-pr-policy",
    roleId: "release_manager",
    kind: "draft_pr_policy",
    baseBranch: "main",
    branchName: "codex/fixture-policy"
  });
  assert(draftPrPolicy.status === "completed", "Draft PR policy preflight should complete without creating a PR.");
  assert(draftPrPolicy.result?.remoteMutationPolicy?.allowed === false, "Draft PR policy should be blocked by default.");
  assert(draftPrPolicy.result?.remoteMutationPolicy?.blockers.some((item) => item.includes("Draft PR creation is disabled")), "Draft PR policy should record disabled PR permission.");

  const blockedBranchPush = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-branch-push-blocked",
    roleId: "release_manager",
    kind: "branch_push",
    baseBranch: "main",
    branchName: "codex/fixture-policy"
  });
  assert(blockedBranchPush.status === "blocked" && blockedBranchPush.errorCode === "remote_disabled", "Branch push should be blocked by default.");

  const blockedDraftPrCreate = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-draft-pr-create-blocked",
    roleId: "release_manager",
    kind: "draft_pr_create",
    baseBranch: "main",
    branchName: "codex/fixture-policy"
  });
  assert(blockedDraftPrCreate.status === "blocked" && blockedDraftPrCreate.errorCode === "remote_disabled", "Draft PR creation should be blocked by default.");

  const blockedCommit = await service.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-commit-blocked",
    roleId: "tech_lead",
    kind: "local_commit"
  });
  assert(blockedCommit.status === "blocked" && blockedCommit.errorCode === "commit_disabled", "Local commit should be blocked by default.");

  await rm(join(repo, ".env"), { force: true });
  const commitService = new GitOperationService({
    runner: new LocalGitRunner({ workspaceRoot: repo, allowGitCommit: true, timeoutMs: 5000 }),
    operationStore: new FileGitOperationStore(join(tempDir, "git-operations-enabled.json")),
    missionStore,
    artifactStore,
    now: createNow()
  });
  const createdCommit = await commitService.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-commit",
    roleId: "tech_lead",
    kind: "local_commit",
    commitMessage: "Update fixture evidence"
  });
  assert(createdCommit.status === "completed", "Enabled local commit should complete in a temp repository.");
  assert(createdCommit.result?.commitSha, "Enabled local commit should record the commit SHA.");
  const postCommitStatus = await commitService.executeOperation({
    missionId: "mission-git",
    taskId: "task-git-post-commit",
    roleId: "tech_lead",
    kind: "status"
  });
  assert(postCommitStatus.result?.worktree?.isClean === true, "Worktree should be clean after enabled local commit.");

  const operations = await service.listOperations("mission-git");
  assert(operations.length === 11, "Git operation store should list default-policy operations.");
  const session = await missionStore.readSession();
  assert(session.auditEvents.some((event) => event.action === "git_operation_completed"), "Session should include Git operation audit evidence.");
  assert(session.runtime.activityLog.some((event) => event.title.includes("Git operation")), "Session should include Git operation activity rows.");
  await operationStore.reset();
  assert((await operationStore.listOperations()).length === 0, "Git operation store reset should clear history.");

  console.log("Git runner verification passed.");
  console.log(`Default-policy operations verified: ${operations.length}`);
  console.log(`Git artifacts verified: ${(await artifactStore.readArtifacts()).filter((artifact) => artifact.source === "git_runner").length}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Git runner verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
