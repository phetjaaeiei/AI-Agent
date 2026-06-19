import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
await mkdir(join(workspace, "src"), { recursive: true });
await writeFile(join(workspace, "src", "app.ts"), "export const value = 1;\n", "utf8");
await git(["init"]);
await git(["config", "user.name", "Team AI Agent"]);
await git(["config", "user.email", "team-ai-agent@example.local"]);
await git(["add", "src/app.ts"]);
await git(["commit", "-m", "Initial fixture"]);
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
  artifactStore
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
