import { randomUUID } from "node:crypto";
import type { ToolRunner } from "../../../packages/tool-runner/src/index.js";
import { ToolExecutionError } from "../../../packages/tool-runner/src/index.js";
import type {
  RoleId,
  ToolCallRecord,
  ToolCallRequest,
  ToolCallResult,
  ToolFailureCode,
  ToolPolicyDecision,
  ToolPolicySnapshot
} from "../../../packages/shared/src/index.js";
import {
  createRuntimeArtifactRecord,
  createRuntimeAuditEvent,
  createRuntimeSessionSnapshot
} from "../../../packages/workflow/src/index.js";
import type { RuntimeActivityEvent, RuntimeArtifactContent, RuntimeArtifactSection } from "../../../packages/workflow/src/index.js";
import type { ArtifactContentStore } from "./artifact-content-store.js";
import type { MissionStore } from "./mission-store.js";
import type { ToolCallStore } from "./tool-call-store.js";

type ToolCallServiceOptions = {
  runner: ToolRunner;
  toolCallStore: ToolCallStore;
  missionStore: MissionStore;
  artifactStore: ArtifactContentStore;
  now?: () => string;
};

export class ToolCallService {
  private readonly now: () => string;

  constructor(private readonly options: ToolCallServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  getPolicy(): ToolPolicySnapshot {
    return this.options.runner.getPolicy();
  }

  listToolCalls(missionId?: string): Promise<ToolCallRecord[]> {
    return this.options.toolCallStore.listToolCalls(missionId);
  }

  getToolCall(toolCallId: string): Promise<ToolCallRecord | undefined> {
    return this.options.toolCallStore.findToolCall(toolCallId);
  }

  async executeToolCall(input: ToolCallRequest): Promise<ToolCallRecord> {
    const requestedAt = this.now();
    const id = `tool-call-${randomUUID()}`;
    const executionRequest = { ...input, id };
    const policy = this.evaluatePolicy(executionRequest);
    const initial: ToolCallRecord = {
      schemaVersion: 1,
      id,
      missionId: input.missionId,
      taskId: input.taskId,
      roleId: input.roleId,
      kind: input.kind,
      status: policy.allowed ? "queued" : "blocked",
      actionClass: policy.actionClass,
      policy,
      requestedAt,
      updatedAt: requestedAt,
      ...(input.targetPath ? { targetPath: input.targetPath } : {}),
      ...(input.command ? { command: input.command } : {}),
      ...(input.cwd ? { cwd: input.cwd } : {})
    };
    let call = await this.options.toolCallStore.upsertToolCall(initial);

    if (!policy.allowed) {
      call = await this.patchToolCall(call, {
        status: "blocked",
        errorCode: errorCodeForPolicy(input.kind, policy.reason),
        errorSummary: policy.reason,
        completedAt: this.now(),
        updatedAt: this.now()
      });
      await this.persistSessionEvidence(call);
      return call;
    }

    call = await this.patchToolCall(call, { status: "running", startedAt: this.now(), updatedAt: this.now() });
    await this.persistSessionEvidence(call);

    try {
      const result = await this.options.runner.execute(executionRequest);
      const failedByExit = typeof result.exitCode === "number" && result.exitCode !== 0;
      const artifact = shouldCreateArtifact(call, result) ? await this.persistToolArtifact(call, result, !failedByExit) : undefined;
      call = await this.patchToolCall(call, {
        status: failedByExit ? "failed" : "completed",
        result,
        ...(failedByExit ? { errorCode: "nonzero_exit" as const, errorSummary: result.summary } : {}),
        ...(artifact ? { artifactRecordId: artifact.artifactRecordId, artifactContentId: artifact.id } : {}),
        completedAt: this.now(),
        updatedAt: this.now()
      });
      await this.persistSessionEvidence(call);
      return call;
    } catch (error) {
      const normalized = normalizeToolError(error);
      call = await this.patchToolCall(call, {
        status: isPolicyFailure(normalized.code) ? "blocked" : "failed",
        errorCode: normalized.code,
        errorSummary: normalized.message,
        completedAt: this.now(),
        updatedAt: this.now()
      });
      await this.persistSessionEvidence(call);
      return call;
    }
  }

  private evaluatePolicy(input: ToolCallRequest & { id: string }): ToolPolicyDecision {
    try {
      return this.options.runner.evaluate(input);
    } catch (error) {
      return {
        allowed: false,
        actionClass: input.kind === "file_read" ? "read" : input.kind === "file_write" ? "write_local" : input.kind === "test_command" ? "test" : "draft",
        reason: error instanceof Error ? error.message : "Tool request failed policy evaluation."
      };
    }
  }

  private patchToolCall(call: ToolCallRecord, patch: Partial<ToolCallRecord>): Promise<ToolCallRecord> {
    return this.options.toolCallStore.upsertToolCall({ ...call, ...patch });
  }

  private async persistToolArtifact(
    call: ToolCallRecord,
    result: ToolCallResult,
    passed: boolean
  ): Promise<RuntimeArtifactContent> {
    const createdAt = this.now();
    const current = await this.options.missionStore.readSession();
    const artifactId = artifactIdForToolCall(call);
    const artifactRecord = createRuntimeArtifactRecord({
      artifactId,
      taskId: call.taskId,
      title: artifactTitleForToolCall(call),
      summary: result.summary,
      ownerRoleId: call.roleId,
      gateId: call.kind === "test_command" ? "qa_gate" : "implementation_gate",
      status: passed && call.kind === "test_command" ? "verified" : "reviewing",
      version: current.artifactRecords.filter((item) => item.artifactId === artifactId).length + 1,
      createdAt
    });
    const sections = sectionsForToolResult(call, result);
    const artifact: RuntimeArtifactContent = {
      schemaVersion: 1,
      id: `artifact-content-${artifactId}-${call.id}`,
      artifactRecordId: artifactRecord.id,
      artifactId: artifactRecord.artifactId,
      taskId: artifactRecord.taskId,
      missionId: call.missionId,
      title: artifactRecord.title,
      summary: artifactRecord.summary,
      ownerRoleId: artifactRecord.ownerRoleId,
      gateId: artifactRecord.gateId,
      status: artifactRecord.status,
      version: artifactRecord.version,
      format: "markdown",
      source: "tool_runner",
      sections,
      markdown: formatMarkdown(artifactRecord.title, sections),
      createdAt,
      updatedAt: createdAt
    };
    await this.options.artifactStore.appendArtifact(artifact);
    await this.options.missionStore.writeSession(createRuntimeSessionSnapshot({
      ...current,
      selection: {
        ...current.selection,
        selectedGateId: artifactRecord.gateId,
        selectedRoleId: artifactRecord.ownerRoleId,
        selectedRoomId: call.kind === "test_command" ? "qa" : "engineering",
        selectedArtifactId: artifactRecord.artifactId
      },
      artifactRecords: [artifactRecord, ...current.artifactRecords].slice(0, 100),
      savedAt: createdAt
    }));
    return artifact;
  }

  private async persistSessionEvidence(call: ToolCallRecord): Promise<void> {
    const current = await this.options.missionStore.readSession();
    const createdAt = this.now();
    const title = titleForStatus(call);
    const severity = call.status === "completed" ? "success" : call.status === "blocked" || call.status === "failed" ? "warning" : "info";
    const tone: RuntimeActivityEvent["tone"] = severity === "success" ? "success" : severity === "warning" ? "warning" : "info";
    const audit = createRuntimeAuditEvent({
      id: `audit-tool-call-${call.id}-${call.status}`,
      actorRoleId: call.roleId,
      action: call.status === "completed" ? "tool_call_completed" : call.status === "failed" || call.status === "blocked" ? "tool_call_failed" : "tool_call_started",
      summary: call.errorSummary ?? call.result?.summary ?? call.policy.reason,
      severity,
      entityId: call.id,
      createdAt
    });
    await this.options.missionStore.writeSession(createRuntimeSessionSnapshot({
      ...current,
      runtime: {
        ...current.runtime,
        activityLog: [{
          id: `evt-tool-call-${call.id}-${call.status}`,
          roleId: call.roleId,
          type: "tool" as const,
          title,
          summary: call.errorSummary ?? call.result?.summary ?? call.policy.reason,
          tone,
          time: formatTime(createdAt)
        }, ...current.runtime.activityLog].slice(0, 80)
      },
      auditEvents: [audit, ...current.auditEvents].slice(0, 200),
      savedAt: createdAt
    }));
  }
}

function shouldCreateArtifact(call: ToolCallRecord, result: ToolCallResult): boolean {
  return call.kind === "file_write" || call.kind === "test_command" || Boolean(result.patch);
}

function artifactIdForToolCall(call: ToolCallRecord): string {
  if (call.kind === "test_command") return `art-test-result-${call.id}`;
  if (call.kind === "file_write") return `art-code-patch-${call.id}`;
  return `art-tool-output-${call.id}`;
}

function artifactTitleForToolCall(call: ToolCallRecord): string {
  if (call.kind === "test_command") return "Test Run Evidence";
  if (call.kind === "file_write") return "Local Code Patch";
  return "Tool Output Evidence";
}

function sectionsForToolResult(call: ToolCallRecord, result: ToolCallResult): RuntimeArtifactSection[] {
  const target = call.targetPath ?? call.command ?? "local workspace";
  const sections: RuntimeArtifactSection[] = [
    {
      heading: "Tool Call",
      body: `${call.kind.replaceAll("_", " ")} executed by ${call.roleId}.`,
      evidence: [`Target: ${target}`, `Policy: ${call.policy.reason}`, ...result.evidence]
    }
  ];
  if (result.patch) {
    sections.push({ heading: "Patch", body: result.patch, evidence: [result.beforeHash ? `Before: ${result.beforeHash}` : "New file", result.afterHash ? `After: ${result.afterHash}` : "No after hash"] });
  }
  if (result.stdout || result.stderr || typeof result.exitCode === "number") {
    sections.push({
      heading: "Command Output",
      body: [result.stdout ? `stdout:\n${result.stdout}` : "", result.stderr ? `stderr:\n${result.stderr}` : ""].filter(Boolean).join("\n\n") || "No command output.",
      evidence: [`Exit code: ${result.exitCode ?? 0}`, `Duration: ${result.durationMs}ms`]
    });
  }
  return sections;
}

function titleForStatus(call: ToolCallRecord): string {
  if (call.status === "completed") return "Tool call completed";
  if (call.status === "failed") return "Tool call failed";
  if (call.status === "blocked") return "Tool call blocked";
  if (call.status === "running") return "Tool call running";
  return "Tool call queued";
}

function normalizeToolError(error: unknown): { code: ToolFailureCode; message: string } {
  if (error instanceof ToolExecutionError) return { code: error.code, message: error.message };
  return { code: "io_error", message: error instanceof Error ? error.message : "Unknown tool execution error." };
}

function isPolicyFailure(code: ToolFailureCode): boolean {
  return code === "policy_denied" || code === "path_outside_workspace" || code === "secret_path" || code === "command_blocked";
}

function errorCodeForPolicy(kind: ToolCallRequest["kind"], reason: string): ToolFailureCode {
  if (reason.includes("outside") || reason.includes("inside an allowed workspace")) return "path_outside_workspace";
  if (reason.includes("secret") || reason.includes("denied")) return "secret_path";
  if (kind === "shell_command" || kind === "test_command") return "command_blocked";
  return "policy_denied";
}

function formatMarkdown(title: string, sections: readonly RuntimeArtifactSection[]): string {
  return [`# ${title}`, "", ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body, "", ...section.evidence.map((item) => `- ${item}`), ""])].join("\n").trim();
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
