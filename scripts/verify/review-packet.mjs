import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createDefaultOrchestratorArtifactContents, createDefaultOrchestratorSession } from "../../dist/apps/orchestrator/src/fixtures.js";
import { FileArtifactContentStore } from "../../dist/apps/orchestrator/src/artifact-content-store.js";
import { GitOperationService } from "../../dist/apps/orchestrator/src/git-operation-service.js";
import { FileGitOperationStore } from "../../dist/apps/orchestrator/src/git-operation-store.js";
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";
import { ReviewPacketService } from "../../dist/apps/orchestrator/src/review-packet-service.js";
import { FileReviewPacketStore } from "../../dist/apps/orchestrator/src/review-packet-store.js";
import { ToolCallService } from "../../dist/apps/orchestrator/src/tool-call-service.js";
import { FileToolCallStore } from "../../dist/apps/orchestrator/src/tool-call-store.js";
import { LocalGitRunner } from "../../dist/packages/git-runner/src/index.js";
import { DEFAULT_LOCAL_CI_COMMANDS } from "../../dist/packages/shared/src/index.js";
import { LocalToolRunner } from "../../dist/packages/tool-runner/src/index.js";

const failures = [];
const run = promisify(execFile);
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const root = await mkdtemp(join(tmpdir(), "team-ai-agent-review-"));
const workspace = join(root, "workspace");
const remote = join(root, "origin.git");
await mkdir(join(workspace, "src"), { recursive: true });
await writeFile(join(workspace, "src", "app.ts"), "export const value = 1;\n", "utf8");
await git(["init"]);
await git(["config", "user.name", "Team AI Agent"]);
await git(["config", "user.email", "team-ai-agent@example.local"]);
await git(["add", "src/app.ts"]);
await git(["commit", "-m", "Initial fixture"]);
await git(["branch", "-M", "main"]);
await run("git", ["init", "--bare", remote]);
await run("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: remote });
await git(["remote", "add", "origin", remote]);
await git(["push", "-u", "origin", "main"]);
await writeFile(join(workspace, "src", "app.ts"), "export const value = 2;\n", "utf8");

const missionStore = new FileMissionStore(join(root, "mission.json"), () => createDefaultOrchestratorSession("2026-06-19T10:00:00.000Z"));
const artifactStore = new FileArtifactContentStore(join(root, "artifacts.json"), () => createDefaultOrchestratorArtifactContents("2026-06-19T10:00:00.000Z"));
const toolCallStore = new FileToolCallStore(join(root, "tools.json"));
const gitOperationStore = new FileGitOperationStore(join(root, "git.json"));
const packetStore = new FileReviewPacketStore(join(root, "reviews.json"));
const passingRunner = createFixtureToolRunner(workspace);
const toolCallService = new ToolCallService({ runner: passingRunner, toolCallStore, missionStore, artifactStore });
const gitService = new GitOperationService({
  runner: new LocalGitRunner({ workspaceRoot: workspace, timeoutMs: 5000 }),
  operationStore: gitOperationStore,
  missionStore,
  artifactStore,
  reviewPacketStore: packetStore
});
const reviewService = new ReviewPacketService({ packetStore, missionStore, artifactStore, toolCallStore, gitOperationStore, toolCallService });
const missionId = (await missionStore.readSession()).missionId;

try {
  const realPolicy = new LocalToolRunner({ workspaceRoot: workspace }).getPolicy();
  for (const command of DEFAULT_LOCAL_CI_COMMANDS) {
    assert(realPolicy.allowedCommandPrefixes.includes(command), `${command} must be allowlisted by the real tool runner.`);
  }

  for (const kind of ["status", "diff", "commit_plan"]) {
    const operation = await gitService.executeOperation({
      missionId,
      taskId: "task-review",
      roleId: "tech_lead",
      kind,
      ...(kind === "commit_plan" ? { baseBranch: "main" } : {})
    });
    assert(operation.status === "completed", `${kind} evidence should complete.`);
  }

  const created = await reviewService.createPacket({ missionId, taskId: "task-review", roleId: "tech_lead" });
  assert(created.status === "draft", "A packet without CI and reviewer approvals should remain draft.");
  assert(created.requirements.find((item) => item.id === "changed_files")?.status === "pass", "Changed-file evidence should pass.");
  assert(created.requirements.find((item) => item.id === "passing_tests")?.status === "missing", "CI evidence should start missing.");

  const withCi = await reviewService.runLocalCi(created.id);
  assert(withCi.ciRun?.status === "passed", "The default local CI profile should pass with the fixture runner.");
  assert(withCi.ciRun?.commands.length === DEFAULT_LOCAL_CI_COMMANDS.length, "CI should run every default command.");
  assert(withCi.status === "draft", "Reviewer approvals should still be required after CI passes.");

  let reviewed = withCi;
  for (const reviewerRoleId of ["tech_lead", "qa_lead", "lead_ba"]) {
    reviewed = await reviewService.recordDecision(reviewed.id, {
      reviewerRoleId,
      decision: "pass",
      summary: `${reviewerRoleId} verified local evidence.`
    });
  }
  assert(reviewed.status === "ready", "All evidence and required reviewer approvals should make the packet ready.");

  const delivered = await reviewService.createDeliveryPacket(reviewed.id);
  assert(delivered.status === "delivered", "A ready packet should become delivered after Markdown generation.");
  assert(delivered.deliveryArtifactContentId, "Delivery should persist an artifact content reference.");
  const deliveryArtifact = (await artifactStore.readArtifacts()).find((item) => item.id === delivered.deliveryArtifactContentId);
  assert(deliveryArtifact?.source === "review_service", "Delivery artifact should identify the review service source.");
  assert(deliveryArtifact?.markdown.includes("## Verification"), "Delivery Markdown should include verification evidence.");
  assert(deliveryArtifact?.markdown.includes("Remote push disabled"), "Delivery Markdown should preserve offline safety boundaries.");

  const pushPolicy = await gitService.executeOperation({
    missionId,
    taskId: "task-review",
    roleId: "release_manager",
    kind: "branch_push_policy",
    baseBranch: "main",
    branchName: "codex/review-policy",
    reviewPacketId: delivered.id
  });
  assert(pushPolicy.status === "completed", "Branch push policy should complete after delivery.");
  assert(pushPolicy.result?.remoteMutationPolicy?.reviewedDeliveryPresent === true, "Branch push policy should recognize delivered review evidence.");
  assert(pushPolicy.result?.remoteMutationPolicy?.reviewPacketId === delivered.id, "Branch push policy should record the explicit review packet id.");
  assert(pushPolicy.result?.remoteMutationPolicy?.deliveryArtifactContentId === delivered.deliveryArtifactContentId, "Branch push policy should record delivery artifact content id.");
  assert(pushPolicy.result?.remoteMutationPolicy?.allowed === false, "Branch push policy should remain blocked while remote push permission is disabled.");

  await git(["switch", "-c", "codex/review-policy"]);
  await git(["add", "src/app.ts"]);
  await git(["commit", "-m", "Update review policy fixture"]);
  await git(["remote", "set-url", "origin", "https://github.com/phetjaaeiei/AI-Agent.git"]);
  await git(["config", `url.${remote}.insteadOf`, "https://github.com/phetjaaeiei/AI-Agent.git"]);

  const fakeBin = join(root, "bin");
  await mkdir(fakeBin, { recursive: true });
  await writeFile(
    join(fakeBin, "gh"),
    [
      "#!/bin/sh",
      "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"create\" ]; then",
      "  printf '%s\\n' 'https://github.com/phetjaaeiei/AI-Agent/pull/123'",
      "  exit 0",
      "fi",
      "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"view\" ]; then",
      "  printf '%s\\n' '{\"number\":123,\"url\":\"https://github.com/phetjaaeiei/AI-Agent/pull/123\",\"state\":\"OPEN\",\"isDraft\":true,\"title\":\"Fixture draft PR\",\"headRefName\":\"codex/review-policy\",\"baseRefName\":\"main\",\"mergeStateStatus\":\"CLEAN\",\"statusCheckRollup\":[{\"name\":\"verify\",\"status\":\"COMPLETED\",\"conclusion\":\"SUCCESS\"}]}'",
      "  exit 0",
      "fi",
      "printf '%s\\n' 'unsupported gh fixture command' >&2",
      "exit 1",
      ""
    ].join("\n"),
    "utf8"
  );
  await chmod(join(fakeBin, "gh"), 0o755);

  const previousPath = process.env.PATH;
  process.env.PATH = `${fakeBin}:${previousPath ?? ""}`;
  try {
    const remoteMutationStore = new FileGitOperationStore(join(root, "git-remote-mutations.json"));
    const remoteMutationService = new GitOperationService({
      runner: new LocalGitRunner({ workspaceRoot: workspace, timeoutMs: 5000, allowRemotePush: true, allowPullRequestCreate: true }),
      operationStore: remoteMutationStore,
      missionStore,
      artifactStore,
      reviewPacketStore: packetStore
    });

    const branchPush = await remoteMutationService.executeOperation({
      missionId,
      taskId: "task-review",
      roleId: "release_manager",
      kind: "branch_push",
      baseBranch: "main",
      branchName: "codex/review-policy",
      reviewPacketId: delivered.id
    });
    assert(branchPush.status === "completed", "Enabled branch push should complete after reviewed delivery.");
    assert(branchPush.result?.branchPush?.branchName === "codex/review-policy", "Branch push should record the pushed codex branch.");
    assert(branchPush.result?.remoteMutationPolicy?.reviewedDeliveryPresent === true, "Branch push should keep reviewed delivery evidence.");
    assert(branchPush.artifactContentId, "Branch push should create evidence artifact.");
    const remoteBranch = await run("git", ["ls-remote", "--heads", remote, "codex/review-policy"]);
    assert(remoteBranch.stdout.includes("refs/heads/codex/review-policy"), "Branch push should publish the branch to origin.");

    const draftPr = await remoteMutationService.executeOperation({
      missionId,
      taskId: "task-review",
      roleId: "release_manager",
      kind: "draft_pr_create",
      baseBranch: "main",
      branchName: "codex/review-policy",
      reviewPacketId: delivered.id
    });
    assert(draftPr.status === "completed", "Enabled draft PR creation should complete with fake gh.");
    assert(draftPr.result?.draftPullRequest?.url === "https://github.com/phetjaaeiei/AI-Agent/pull/123", "Draft PR result should record the created URL.");
    assert(draftPr.result?.draftPullRequest?.draft === true, "Draft PR result should stay draft-only.");
    assert(draftPr.result?.draftPullRequest?.body.includes("## Verification"), "Draft PR body should include delivery verification Markdown.");
    assert(draftPr.result?.draftPullRequest?.body.includes("## Remote Safety"), "Draft PR body should include remote safety notes.");
    assert(draftPr.result?.remoteMutationPolicy?.forcePushAllowed === false, "Draft PR creation should keep force push disabled.");
    assert(draftPr.artifactContentId, "Draft PR creation should create evidence artifact.");

    const remoteEvidence = await remoteMutationService.executeOperation({
      missionId,
      taskId: "task-review",
      roleId: "release_manager",
      kind: "remote_evidence",
      baseBranch: "main",
      branchName: "codex/review-policy"
    });
    assert(remoteEvidence.status === "completed", "Remote evidence should complete after branch push and fake draft PR.");
    assert(remoteEvidence.result?.remoteEvidence?.publicationState === "published_current", "Remote evidence should report the pushed branch as current.");
    assert(remoteEvidence.result?.remoteEvidence?.pullRequest.state === "open", "Remote evidence should read fake draft PR state.");
    assert(remoteEvidence.result?.remoteEvidence?.pullRequest.draft === true, "Remote evidence should preserve draft PR state.");
    assert(remoteEvidence.result?.remoteEvidence?.checks.state === "passing", "Remote evidence should summarize fake status checks.");
    assert(remoteEvidence.result?.remoteEvidence?.blockedActions.some((item) => item.includes("Deployment")), "Remote evidence should keep deployment blocked.");
    assert(remoteEvidence.artifactContentId, "Remote evidence should create evidence artifact.");
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }

  const failingToolService = new ToolCallService({
    runner: createFixtureToolRunner(workspace, "npm run verify:tool-runner"),
    toolCallStore,
    missionStore,
    artifactStore
  });
  const failingReviewService = new ReviewPacketService({
    packetStore,
    missionStore,
    artifactStore,
    toolCallStore,
    gitOperationStore,
    toolCallService: failingToolService
  });
  const failingPacket = await failingReviewService.createPacket({ missionId, taskId: "task-review-failure", roleId: "tech_lead" });
  const failedCiPacket = await failingReviewService.runLocalCi(failingPacket.id);
  assert(failedCiPacket.status === "blocked", "A failed local CI command should block the packet.");
  assert(failedCiPacket.requirements.find((item) => item.id === "passing_tests")?.status === "block", "Failed test evidence should block the passing-tests requirement.");

  await packetStore.reset();
  assert((await packetStore.listPackets()).length === 0, "Review packet store reset should clear packet history.");
} finally {
  await rm(root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Review packet verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Review packet verification passed.");
console.log(`Default CI commands: ${DEFAULT_LOCAL_CI_COMMANDS.length}`);

function git(args) {
  return run("git", args, { cwd: workspace });
}

function createFixtureToolRunner(workspaceRoot, failingCommand) {
  const runner = new LocalToolRunner({ workspaceRoot });
  return {
    getPolicy: () => runner.getPolicy(),
    evaluate: (request) => runner.evaluate(request),
    execute: async (request) => {
      const failed = request.command === failingCommand;
      return {
        summary: failed ? `${request.command} failed in the fixture.` : `${request.command} passed in the fixture.`,
        evidence: [`Command: ${request.command}`, `Exit code: ${failed ? 1 : 0}`],
        durationMs: 1,
        exitCode: failed ? 1 : 0,
        stdout: failed ? "" : "verification passed",
        stderr: failed ? "fixture failure" : ""
      };
    }
  };
}
