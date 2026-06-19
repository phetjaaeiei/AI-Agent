import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalToolRunner } from "../../dist/packages/tool-runner/src/index.js";
import { ToolCallService } from "../../dist/apps/orchestrator/src/tool-call-service.js";
import { FileToolCallStore } from "../../dist/apps/orchestrator/src/tool-call-store.js";
import { FileArtifactContentStore } from "../../dist/apps/orchestrator/src/artifact-content-store.js";
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";
import { createDefaultOrchestratorArtifactContents, createDefaultOrchestratorSession } from "../../dist/apps/orchestrator/src/fixtures.js";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const tempDir = await mkdtemp(join(tmpdir(), "team-ai-agent-tools-"));
const workspace = join(tempDir, "workspace");

try {
  await mkdir(join(workspace, "docs"), { recursive: true });
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "docs", "plan.md"), "# Local Plan\n\nEvidence ready.\n", "utf8");
  await writeFile(join(workspace, ".env"), "OPENAI_API_KEY=sk-not-real\n", "utf8");
  await writeFile(join(workspace, "check.mjs"), "console.log('check ok')\n", "utf8");
  await writeFile(join(workspace, "fail.mjs"), "console.error('check failed')\nprocess.exit(7)\n", "utf8");
  await writeFile(join(workspace, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      check: "node check.mjs",
      test: "node fail.mjs"
    }
  }, null, 2), "utf8");

  const missionStore = new FileMissionStore(join(tempDir, "session.json"), () => createDefaultOrchestratorSession("2026-06-19T12:00:00.000Z"));
  const artifactStore = new FileArtifactContentStore(join(tempDir, "artifacts.json"), () =>
    createDefaultOrchestratorArtifactContents("2026-06-19T12:00:00.000Z")
  );
  const toolCallStore = new FileToolCallStore(join(tempDir, "tool-calls.json"));
  const service = new ToolCallService({
    runner: new LocalToolRunner({ workspaceRoot: workspace, timeoutMs: 5000 }),
    toolCallStore,
    missionStore,
    artifactStore,
    now: (() => {
      let index = 0;
      return () => `2026-06-19T12:${String(index++).padStart(2, "0")}:00.000Z`;
    })()
  });

  const policy = service.getPolicy();
  assert(policy.workspaceRoot === workspace, "Policy should expose the configured workspace root.");
  assert(policy.allowFileWrite === true, "Default local policy should allow workspace file writes.");
  assert(policy.deniedPathPatterns.includes(".env"), "Policy should deny env files.");

  const read = await service.executeToolCall({
    missionId: "mission-tools",
    taskId: "task-tool-read",
    roleId: "tech_lead",
    kind: "file_read",
    targetPath: "docs/plan.md"
  });
  assert(read.status === "completed", "File read should complete.");
  assert(read.result?.stdout?.includes("Evidence ready"), "File read should include clipped content evidence.");
  assert(read.result?.bytesRead > 0, "File read should record bytes read.");

  const secret = await service.executeToolCall({
    missionId: "mission-tools",
    taskId: "task-tool-secret",
    roleId: "security_engineer",
    kind: "file_read",
    targetPath: ".env"
  });
  assert(secret.status === "blocked" && secret.errorCode === "secret_path", "Secret path should be blocked with a typed error.");

  const outside = await service.executeToolCall({
    missionId: "mission-tools",
    taskId: "task-tool-outside",
    roleId: "tech_lead",
    kind: "file_read",
    targetPath: "../outside.txt"
  });
  assert(outside.status === "blocked" && outside.errorCode === "path_outside_workspace", "Outside workspace reads should be blocked.");

  const write = await service.executeToolCall({
    missionId: "mission-tools",
    taskId: "task-tool-write",
    roleId: "frontend_developer",
    kind: "file_write",
    targetPath: "src/generated.txt",
    content: "generated evidence\n"
  });
  assert(write.status === "completed", "File write should complete inside the workspace.");
  assert(write.artifactContentId, "File write should create a patch artifact.");
  assert((await readFile(join(workspace, "src", "generated.txt"), "utf8")).includes("generated evidence"), "File write should persist content.");
  const artifactsAfterWrite = await artifactStore.readArtifacts();
  assert(artifactsAfterWrite[0].source === "tool_runner", "Patch artifact should record tool_runner source.");
  assert(artifactsAfterWrite[0].markdown.includes("Local Code Patch"), "Patch artifact should include its title.");
  assert(artifactsAfterWrite[0].markdown.includes("+generated evidence"), "Patch artifact should include a unified patch.");

  const testPass = await service.executeToolCall({
    missionId: "mission-tools",
    taskId: "task-tool-test-pass",
    roleId: "automation_qa",
    kind: "test_command",
    command: "npm run check"
  });
  assert(testPass.status === "completed", "Passing test command should complete.");
  assert(testPass.result?.exitCode === 0, "Passing test command should record exit code 0.");
  assert(testPass.artifactContentId, "Passing test command should create test evidence.");

  const testFail = await service.executeToolCall({
    missionId: "mission-tools",
    taskId: "task-tool-test-fail",
    roleId: "automation_qa",
    kind: "test_command",
    command: "npm run test"
  });
  assert(testFail.status === "failed" && testFail.errorCode === "nonzero_exit", "Failing test command should be a typed nonzero failure.");
  assert(testFail.result?.exitCode === 7, "Failing test command should record its exit code.");
  assert(testFail.artifactContentId, "Failing test command should still preserve evidence.");

  const blockedCommand = await service.executeToolCall({
    missionId: "mission-tools",
    taskId: "task-tool-command-blocked",
    roleId: "devops_lead",
    kind: "shell_command",
    command: "rm -rf ."
  });
  assert(blockedCommand.status === "blocked" && blockedCommand.errorCode === "command_blocked", "Dangerous shell command should be blocked.");

  const calls = await service.listToolCalls("mission-tools");
  assert(calls.length === 7, "Tool call store should list all mission tool calls.");
  const session = await missionStore.readSession();
  assert(session.auditEvents.some((event) => event.action === "tool_call_completed"), "Session should include tool completion audit evidence.");
  assert(session.runtime.activityLog.some((event) => event.type === "tool"), "Session should include tool activity rows.");

  await toolCallStore.reset();
  assert((await toolCallStore.listToolCalls()).length === 0, "Tool call store reset should clear history.");

  console.log("Tool runner verification passed.");
  console.log(`Tool calls verified: ${calls.length}`);
  console.log(`Artifacts verified: ${(await artifactStore.readArtifacts()).filter((artifact) => artifact.source === "tool_runner").length}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Tool runner verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
