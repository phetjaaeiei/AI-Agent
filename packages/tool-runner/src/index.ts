import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type {
  ToolActionClass,
  ToolCallKind,
  ToolCallRequest,
  ToolCallResult,
  ToolFailureCode,
  ToolPolicyDecision,
  ToolPolicySnapshot
} from "../../shared/src/index.js";

export type ToolExecutionRequest = ToolCallRequest & {
  id: string;
};

export interface ToolRunner {
  getPolicy(): ToolPolicySnapshot;
  evaluate(request: ToolExecutionRequest): ToolPolicyDecision;
  execute(request: ToolExecutionRequest, signal?: AbortSignal): Promise<ToolCallResult>;
}

export class ToolExecutionError extends Error {
  constructor(
    readonly code: ToolFailureCode,
    message: string
  ) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

export type LocalToolRunnerOptions = {
  workspaceRoot: string;
  allowedWorkspaceRoots?: readonly string[];
  allowFileRead?: boolean;
  allowFileWrite?: boolean;
  allowShellCommand?: boolean;
  allowTestCommand?: boolean;
  timeoutMs?: number;
  maxReadBytes?: number;
  maxWriteBytes?: number;
  maxOutputBytes?: number;
  deniedPathPatterns?: readonly string[];
  allowedCommandPrefixes?: readonly string[];
};

const DEFAULT_DENIED_PATH_PATTERNS = [
  ".git",
  ".data",
  ".env",
  ".env.local",
  ".env.production",
  "node_modules",
  "dist",
  "coverage",
  ".pem",
  ".key",
  ".p12",
  "id_rsa",
  "id_ed25519"
] as const;

const DEFAULT_ALLOWED_COMMAND_PREFIXES = [
  "pwd",
  "ls",
  "rg",
  "npm test",
  "npm run check",
  "npm run test",
  "npm run typecheck",
  "npm run build",
  "npm run build:web",
  "npm run verify:foundation",
  "npm run verify:orchestrator",
  "npm run verify:agent-runtime",
  "npm run verify:tool-runner",
  "npm run verify:git-runner",
  "npm run eval:agent-runtime"
] as const;

const SHELL_META_PATTERN = /[;&|<>`$(){}]/;

export class LocalToolRunner implements ToolRunner {
  private readonly policy: ToolPolicySnapshot;

  constructor(options: LocalToolRunnerOptions) {
    const workspaceRoot = resolve(options.workspaceRoot);
    const allowedWorkspaceRoots = (options.allowedWorkspaceRoots?.length ? options.allowedWorkspaceRoots : [workspaceRoot]).map((root) =>
      resolve(root)
    );

    this.policy = {
      schemaVersion: 1,
      workspaceRoot,
      allowedWorkspaceRoots,
      allowFileRead: options.allowFileRead ?? true,
      allowFileWrite: options.allowFileWrite ?? true,
      allowShellCommand: options.allowShellCommand ?? true,
      allowTestCommand: options.allowTestCommand ?? true,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxReadBytes: options.maxReadBytes ?? 64_000,
      maxWriteBytes: options.maxWriteBytes ?? 256_000,
      maxOutputBytes: options.maxOutputBytes ?? 24_000,
      deniedPathPatterns: options.deniedPathPatterns ?? DEFAULT_DENIED_PATH_PATTERNS,
      allowedCommandPrefixes: options.allowedCommandPrefixes ?? DEFAULT_ALLOWED_COMMAND_PREFIXES
    };
  }

  getPolicy(): ToolPolicySnapshot {
    return this.policy;
  }

  evaluate(request: ToolExecutionRequest): ToolPolicyDecision {
    const actionClass = actionClassForKind(request.kind);

    if ((request.kind === "file_read" || request.kind === "file_write") && !request.targetPath?.trim()) {
      return { allowed: false, actionClass, reason: "File tool calls require targetPath." };
    }

    if ((request.kind === "shell_command" || request.kind === "test_command") && !request.command?.trim()) {
      return { allowed: false, actionClass, reason: "Command tool calls require command." };
    }

    if (request.kind === "file_read" && !this.policy.allowFileRead) {
      return { allowed: false, actionClass, reason: "File read is disabled by policy." };
    }

    if (request.kind === "file_write" && !this.policy.allowFileWrite) {
      return { allowed: false, actionClass, reason: "File write is disabled by policy." };
    }

    if (request.kind === "shell_command" && !this.policy.allowShellCommand) {
      return { allowed: false, actionClass, reason: "Shell command execution is disabled by policy." };
    }

    if (request.kind === "test_command" && !this.policy.allowTestCommand) {
      return { allowed: false, actionClass, reason: "Test command execution is disabled by policy." };
    }

    if (request.kind === "file_read" || request.kind === "file_write") {
      const normalizedTarget = this.normalizeWorkspacePath(request.targetPath ?? "");
      if (!normalizedTarget) {
        return { allowed: false, actionClass, reason: "Target path must stay inside an allowed workspace root." };
      }
      if (this.isDeniedPath(normalizedTarget)) {
        return { allowed: false, actionClass, normalizedTarget, reason: "Target path matches a denied secret or generated path pattern." };
      }
      if (request.kind === "file_write" && (request.content?.length ?? 0) > this.policy.maxWriteBytes) {
        return { allowed: false, actionClass, normalizedTarget, reason: "Write content exceeds the configured byte limit." };
      }
      return { allowed: true, actionClass, normalizedTarget, reason: "Path is inside the local workspace policy." };
    }

    const command = request.command?.trim() ?? "";
    const commandDecision = this.evaluateCommand(command, request.kind);
    if (!commandDecision.allowed) return { ...commandDecision, actionClass };
    const normalizedTarget = this.normalizeWorkspacePath(request.cwd ?? ".");
    if (!normalizedTarget) return { allowed: false, actionClass, reason: "Command cwd must stay inside an allowed workspace root." };
    if (this.isDeniedPath(normalizedTarget)) {
      return { allowed: false, actionClass, normalizedTarget, reason: "Command cwd matches a denied workspace path pattern." };
    }
    return { allowed: true, actionClass, normalizedTarget, reason: commandDecision.reason };
  }

  async execute(request: ToolExecutionRequest, signal?: AbortSignal): Promise<ToolCallResult> {
    const decision = this.evaluate(request);
    if (!decision.allowed) throw new ToolExecutionError(errorCodeForDeniedRequest(request.kind, decision.reason), decision.reason);

    const started = Date.now();
    if (request.kind === "file_read") return this.readFileTool(request, decision, started);
    if (request.kind === "file_write") return this.writeFileTool(request, decision, started);
    return this.commandTool(request, decision, started, signal);
  }

  private async readFileTool(
    request: ToolExecutionRequest,
    decision: ToolPolicyDecision,
    started: number
  ): Promise<ToolCallResult> {
    const target = requireNormalizedTarget(decision);
    const info = await stat(target);
    if (!info.isFile()) throw new ToolExecutionError("io_error", "Target path is not a file.");
    const bytes = await readFile(target);
    const clipped = bytes.subarray(0, this.policy.maxReadBytes);
    const content = clipped.toString("utf8");
    const truncated = bytes.length > clipped.length;
    const relativeTarget = this.relativeTarget(target);

    return {
      summary: truncated ? `Read ${relativeTarget} with output clipped to ${clipped.length} bytes.` : `Read ${relativeTarget}.`,
      evidence: [`Path: ${relativeTarget}`, `Bytes: ${bytes.length}`, `SHA256: ${sha256(bytes)}`],
      durationMs: Date.now() - started,
      bytesRead: bytes.length,
      stdout: truncateOutput(content, this.policy.maxOutputBytes)
    };
  }

  private async writeFileTool(
    request: ToolExecutionRequest,
    decision: ToolPolicyDecision,
    started: number
  ): Promise<ToolCallResult> {
    const target = requireNormalizedTarget(decision);
    const nextContent = request.content ?? "";
    const before = await readOptionalFile(target);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, nextContent, "utf8");
    const after = Buffer.from(nextContent, "utf8");
    const relativeTarget = this.relativeTarget(target);
    const patch = createUnifiedPatch(relativeTarget, before?.toString("utf8") ?? "", nextContent);

    return {
      summary: before ? `Updated ${relativeTarget}.` : `Created ${relativeTarget}.`,
      evidence: [
        `Path: ${relativeTarget}`,
        `Before SHA256: ${before ? sha256(before) : "new-file"}`,
        `After SHA256: ${sha256(after)}`,
        `Bytes written: ${after.length}`
      ],
      durationMs: Date.now() - started,
      bytesWritten: after.length,
      afterHash: sha256(after),
      patch,
      ...(before ? { beforeHash: sha256(before) } : {})
    };
  }

  private commandTool(
    request: ToolExecutionRequest,
    decision: ToolPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<ToolCallResult> {
    const command = request.command?.trim() ?? "";
    const args = parseCommand(command);
    if (args.length === 0) throw new ToolExecutionError("invalid_request", "Command is empty.");
    const executable = args[0]!;
    const executableArgs = args.slice(1);
    const cwd = requireNormalizedTarget(decision);

    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(executable, executableArgs, {
        cwd,
        shell: false,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          CI: "1",
          NO_COLOR: "1"
        }
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, this.policy.timeoutMs);
      const abort = () => {
        child.kill("SIGTERM");
        rejectPromise(new ToolExecutionError("timeout", "Tool command was aborted."));
      };

      signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = truncateOutput(stdout + chunk.toString("utf8"), this.policy.maxOutputBytes);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = truncateOutput(stderr + chunk.toString("utf8"), this.policy.maxOutputBytes);
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        rejectPromise(new ToolExecutionError("io_error", error.message));
      });
      child.on("close", (exitCode) => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        if (timedOut) {
          rejectPromise(new ToolExecutionError("timeout", `Command exceeded ${this.policy.timeoutMs}ms.`));
          return;
        }
        const code = exitCode ?? 1;
        const summary =
          request.kind === "test_command"
            ? code === 0 ? "Test command passed." : `Test command failed with exit code ${code}.`
            : code === 0 ? "Shell command completed." : `Shell command exited with code ${code}.`;
        resolvePromise({
          summary,
          evidence: [`Command: ${command}`, `Cwd: ${this.relativeTarget(cwd)}`, `Exit code: ${code}`],
          durationMs: Date.now() - started,
          exitCode: code,
          stdout,
          stderr
        });
      });
    });
  }

  private evaluateCommand(command: string, kind: ToolCallKind): ToolPolicyDecision {
    const actionClass = actionClassForKind(kind);
    if (SHELL_META_PATTERN.test(command)) {
      return { allowed: false, actionClass, reason: "Shell metacharacters are blocked; pass a single allowlisted command." };
    }

    const parsed = parseCommand(command);
    if (parsed.length === 0) return { allowed: false, actionClass, reason: "Command is empty." };

    const normalized = parsed.join(" ");
    const allowed = this.policy.allowedCommandPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `));
    if (!allowed) {
      return { allowed: false, actionClass, reason: `Command is not allowlisted: ${parsed[0]}` };
    }

    if (kind === "test_command" && !isTestLikeCommand(normalized)) {
      return { allowed: false, actionClass, reason: "Test tool calls must use a test, check, verify, typecheck, or build command." };
    }

    return { allowed: true, actionClass, reason: "Command is local and allowlisted." };
  }

  private normalizeWorkspacePath(targetPath: string): string | undefined {
    const trimmed = targetPath.trim();
    if (!trimmed) return undefined;
    const resolvedPath = resolve(this.policy.workspaceRoot, trimmed);
    return this.policy.allowedWorkspaceRoots.some((root) => isInside(root, resolvedPath)) ? resolvedPath : undefined;
  }

  private isDeniedPath(targetPath: string): boolean {
    const normalized = targetPath.toLowerCase();
    const parts = normalized.split(sep);
    return this.policy.deniedPathPatterns.some((pattern) => {
      const lowered = pattern.toLowerCase();
      return parts.includes(lowered) || normalized.endsWith(lowered) || normalized.includes(`${sep}${lowered}${sep}`);
    });
  }

  private relativeTarget(targetPath: string): string {
    const relativePath = relative(this.policy.workspaceRoot, targetPath);
    return relativePath && !relativePath.startsWith("..") ? relativePath : targetPath;
  }
}

function actionClassForKind(kind: ToolCallKind): ToolActionClass {
  if (kind === "file_read") return "read";
  if (kind === "file_write") return "write_local";
  if (kind === "test_command") return "test";
  return "draft";
}

function errorCodeForDeniedRequest(kind: ToolCallKind, reason: string): ToolFailureCode {
  if (reason.includes("outside")) return "path_outside_workspace";
  if (reason.includes("secret") || reason.includes("denied")) return "secret_path";
  if (kind === "shell_command" || kind === "test_command") return "command_blocked";
  return "policy_denied";
}

function parseCommand(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;

  for (const char of command.trim()) {
    if ((char === "'" || char === "\"") && !quote) {
      quote = char;
      continue;
    }
    if (quote === char) {
      quote = undefined;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) args.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (quote) throw new ToolExecutionError("invalid_request", "Command quote was not closed.");
  if (current) args.push(current);
  return args;
}

function isTestLikeCommand(command: string): boolean {
  return /\b(test|check|verify|typecheck|build)\b/.test(command);
}

function requireNormalizedTarget(decision: ToolPolicyDecision): string {
  if (!decision.normalizedTarget) throw new ToolExecutionError("policy_denied", "Policy did not produce a normalized target.");
  return decision.normalizedTarget;
}

function isInside(root: string, targetPath: string): boolean {
  const relativePath = relative(root, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !resolve(relativePath).startsWith(".."));
}

async function readOptionalFile(targetPath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(targetPath);
  } catch {
    return undefined;
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function truncateOutput(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  return `${bytes.subarray(0, maxBytes).toString("utf8")}\n[output truncated to ${maxBytes} bytes]`;
}

function createUnifiedPatch(targetPath: string, before: string, after: string): string {
  if (before === after) return `--- a/${targetPath}\n+++ b/${targetPath}\n`;
  const beforeLines = before ? before.split(/\r?\n/) : [];
  const afterLines = after ? after.split(/\r?\n/) : [];
  const lines = [`--- a/${targetPath}`, `+++ b/${targetPath}`, "@@"];
  for (const line of beforeLines.slice(0, 120)) lines.push(`-${line}`);
  for (const line of afterLines.slice(0, 120)) lines.push(`+${line}`);
  if (beforeLines.length > 120 || afterLines.length > 120) lines.push("[patch truncated]");
  return lines.join("\n");
}
