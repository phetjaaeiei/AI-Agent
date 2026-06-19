import { spawn } from "node:child_process";
import { relative, resolve, sep } from "node:path";
import type {
  GitCommitPlanOutput,
  GitDiffStat,
  GitDiffSummary,
  GitFailureCode,
  GitFileStatus,
  GitFileStatusKind,
  GitOperationRequest,
  GitOperationResult,
  GitPolicyDecision,
  GitPolicySnapshot,
  GitPullRequestDraft,
  GitWorktreeRecord
} from "../../shared/src/index.js";

export type GitExecutionRequest = GitOperationRequest & {
  id: string;
};

export interface GitRunner {
  getPolicy(): GitPolicySnapshot;
  evaluate(request: GitExecutionRequest): GitPolicyDecision;
  execute(request: GitExecutionRequest, signal?: AbortSignal): Promise<GitOperationResult>;
}

export class GitExecutionError extends Error {
  constructor(
    readonly code: GitFailureCode,
    message: string
  ) {
    super(message);
    this.name = "GitExecutionError";
  }
}

export type LocalGitRunnerOptions = {
  workspaceRoot: string;
  allowedWorkspaceRoots?: readonly string[];
  allowGitRead?: boolean;
  allowGitCommit?: boolean;
  allowRemotePush?: boolean;
  allowPullRequestCreate?: boolean;
  timeoutMs?: number;
  maxDiffBytes?: number;
  deniedPathPatterns?: readonly string[];
};

const DEFAULT_DENIED_PATH_PATTERNS = [
  ".env",
  ".env.local",
  ".env.production",
  ".data",
  "node_modules",
  "dist",
  "coverage",
  ".pem",
  ".key",
  ".p12",
  "id_rsa",
  "id_ed25519"
] as const;

export class LocalGitRunner implements GitRunner {
  private readonly policy: GitPolicySnapshot;

  constructor(options: LocalGitRunnerOptions) {
    const workspaceRoot = resolve(options.workspaceRoot);
    const allowedWorkspaceRoots = (options.allowedWorkspaceRoots?.length ? options.allowedWorkspaceRoots : [workspaceRoot]).map((root) =>
      resolve(root)
    );

    this.policy = {
      schemaVersion: 1,
      workspaceRoot,
      allowedWorkspaceRoots,
      allowGitRead: options.allowGitRead ?? true,
      allowGitCommit: options.allowGitCommit ?? false,
      allowRemotePush: options.allowRemotePush ?? false,
      allowPullRequestCreate: options.allowPullRequestCreate ?? false,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxDiffBytes: options.maxDiffBytes ?? 80_000,
      deniedPathPatterns: options.deniedPathPatterns ?? DEFAULT_DENIED_PATH_PATTERNS
    };
  }

  getPolicy(): GitPolicySnapshot {
    return this.policy;
  }

  evaluate(request: GitExecutionRequest): GitPolicyDecision {
    const normalizedCwd = this.normalizeWorkspacePath(request.cwd ?? ".");
    if (!normalizedCwd) {
      return { allowed: false, reason: "Git cwd must stay inside an allowed workspace root." };
    }

    if (this.isDeniedPath(normalizedCwd)) {
      return { allowed: false, normalizedCwd, reason: "Git cwd matches a denied path pattern." };
    }

    if (!this.policy.allowGitRead) {
      return { allowed: false, normalizedCwd, reason: "Git read operations are disabled by policy." };
    }

    if (request.kind === "local_commit" && !this.policy.allowGitCommit) {
      return { allowed: false, normalizedCwd, reason: "Local Git commits are disabled by policy." };
    }

    return { allowed: true, normalizedCwd, reason: "Git operation is local and policy-checked." };
  }

  async execute(request: GitExecutionRequest, signal?: AbortSignal): Promise<GitOperationResult> {
    const decision = this.evaluate(request);
    if (!decision.allowed) throw new GitExecutionError(errorCodeForPolicy(request.kind, decision.reason), decision.reason);
    const started = Date.now();

    if (request.kind === "status") return this.status(request, decision, started, signal);
    if (request.kind === "diff") return this.diff(request, decision, started, signal);
    if (request.kind === "commit_plan") return this.commitPlan(request, decision, started, signal);
    if (request.kind === "pr_draft") return this.prDraft(request, decision, started, signal);
    return this.localCommit(request, decision, started, signal);
  }

  private async status(
    _request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const worktree = await this.readWorktree(cwd, signal);
    return {
      summary: worktree.summary,
      evidence: [`Branch: ${worktree.branch}`, `HEAD: ${worktree.headSha}`, `Changed files: ${worktree.files.length}`],
      durationMs: Date.now() - started,
      worktree
    };
  }

  private async diff(
    _request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const [worktree, diff] = await Promise.all([this.readWorktree(cwd, signal), this.readDiff(cwd, signal)]);
    return {
      summary: `Git diff has ${diff.changedFiles} changed file(s), ${diff.insertions} insertion(s), and ${diff.deletions} deletion(s).`,
      evidence: [`Branch: ${worktree.branch}`, `Diff clipped: ${String(diff.clipped)}`, ...diff.files.map((file) => `${file.path}: +${file.insertions}/-${file.deletions}`)],
      durationMs: Date.now() - started,
      worktree,
      diff
    };
  }

  private async commitPlan(
    request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const [worktree, diff] = await Promise.all([this.readWorktree(cwd, signal), this.readDiff(cwd, signal)]);
    const commitPlan = createCommitPlan(worktree, diff, request.baseBranch ?? "main");
    return {
      summary: commitPlan.ready ? "Commit plan is ready for review." : "Commit plan is blocked until safe changed-file evidence exists.",
      evidence: [`Branch proposal: ${commitPlan.branchName}`, `Commit message: ${commitPlan.commitMessage}`, `Ready: ${String(commitPlan.ready)}`],
      durationMs: Date.now() - started,
      worktree,
      diff,
      commitPlan
    };
  }

  private async prDraft(
    request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const [worktree, diff] = await Promise.all([this.readWorktree(cwd, signal), this.readDiff(cwd, signal)]);
    const commitPlan = createCommitPlan(worktree, diff, request.baseBranch ?? "main");
    const prDraft = createPullRequestDraft(commitPlan, request.baseBranch ?? "main", this.policy.allowPullRequestCreate);
    return {
      summary: "Pull request draft metadata prepared offline.",
      evidence: [`PR title: ${prDraft.title}`, `Status: ${prDraft.status}`, `Remote creation allowed: ${String(this.policy.allowPullRequestCreate)}`],
      durationMs: Date.now() - started,
      worktree,
      diff,
      commitPlan,
      prDraft
    };
  }

  private async localCommit(
    request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const before = await this.readWorktree(cwd, signal);
    if (before.isClean) throw new GitExecutionError("invalid_request", "Cannot commit a clean worktree.");
    if (before.hasDeniedChanges) throw new GitExecutionError("secret_path", "Cannot commit denied path changes.");
    const message = request.commitMessage?.trim() || createCommitPlan(before, await this.readDiff(cwd, signal), request.baseBranch ?? "main").commitMessage;
    await runGit(cwd, ["add", "--", ...before.files.filter((file) => !file.isDenied).map((file) => file.path)], this.policy.timeoutMs, signal);
    await runGit(cwd, ["commit", "-m", message], this.policy.timeoutMs, signal);
    const commitSha = (await runGit(cwd, ["rev-parse", "--short", "HEAD"], this.policy.timeoutMs, signal)).stdout.trim();
    const worktree = await this.readWorktree(cwd, signal);
    return {
      summary: `Created local commit ${commitSha}.`,
      evidence: [`Commit: ${commitSha}`, `Message: ${message}`, `Files: ${before.files.length}`],
      durationMs: Date.now() - started,
      worktree,
      commitSha
    };
  }

  private async readWorktree(cwd: string, signal?: AbortSignal): Promise<GitWorktreeRecord> {
    const checkedAt = new Date().toISOString();
    await ensureRepository(cwd, this.policy.timeoutMs, signal);
    const [branchResult, headResult, statusResult] = await Promise.all([
      runGit(cwd, ["branch", "--show-current"], this.policy.timeoutMs, signal),
      runGit(cwd, ["rev-parse", "--short", "HEAD"], this.policy.timeoutMs, signal),
      runGit(cwd, ["status", "--porcelain=v1"], this.policy.timeoutMs, signal)
    ]);
    const files = parsePorcelainStatus(statusResult.stdout, (path) => this.isDeniedRelativePath(path));
    const hasDeniedChanges = files.some((file) => file.isDenied);
    const branch = branchResult.stdout.trim() || "detached";
    const headSha = headResult.stdout.trim() || "unknown";
    const isClean = files.length === 0;
    return {
      isRepository: true,
      branch,
      headSha,
      isClean,
      hasDeniedChanges,
      files,
      summary: isClean ? `Git worktree ${branch} is clean.` : `Git worktree ${branch} has ${files.length} changed file(s).`,
      checkedAt
    };
  }

  private async readDiff(cwd: string, signal?: AbortSignal): Promise<GitDiffSummary> {
    await ensureRepository(cwd, this.policy.timeoutMs, signal);
    const [statResult, diffResult, statusResult] = await Promise.all([
      runGit(cwd, ["diff", "--numstat", "HEAD", "--"], this.policy.timeoutMs, signal),
      runGit(cwd, ["diff", "--no-ext-diff", "--unified=3", "HEAD", "--"], this.policy.timeoutMs, signal),
      runGit(cwd, ["status", "--porcelain=v1"], this.policy.timeoutMs, signal)
    ]);
    const statusByPath = new Map(parsePorcelainStatus(statusResult.stdout, (path) => this.isDeniedRelativePath(path)).map((file) => [file.path, file]));
    const files = parseNumstat(statResult.stdout, statusByPath, (path) => this.isDeniedRelativePath(path));
    const insertions = files.reduce((sum, file) => sum + file.insertions, 0);
    const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
    const filteredDiff = sanitizeDiff(diffResult.stdout, (path) => this.isDeniedRelativePath(path));
    const clippedBytes = Buffer.from(filteredDiff, "utf8");
    const clipped = clippedBytes.length > this.policy.maxDiffBytes;
    const diff = clipped ? `${clippedBytes.subarray(0, this.policy.maxDiffBytes).toString("utf8")}\n[diff clipped]` : filteredDiff;

    return {
      changedFiles: files.length,
      insertions,
      deletions,
      files,
      diff,
      clipped
    };
  }

  private normalizeWorkspacePath(targetPath: string): string | undefined {
    const resolvedPath = resolve(this.policy.workspaceRoot, targetPath.trim() || ".");
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

  private isDeniedRelativePath(targetPath: string): boolean {
    const normalized = targetPath.toLowerCase();
    const parts = normalized.split("/");
    return this.policy.deniedPathPatterns.some((pattern) => {
      const lowered = pattern.toLowerCase();
      return parts.includes(lowered) || normalized.endsWith(lowered) || normalized.includes(`/${lowered}/`);
    });
  }
}

export function parsePorcelainStatus(output: string, isDenied: (path: string) => boolean): GitFileStatus[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line): GitFileStatus => {
      const indexStatus = line.slice(0, 1);
      const worktreeStatus = line.slice(1, 2);
      const rawPath = line.slice(3).trim();
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;
      const kind = statusKind(indexStatus, worktreeStatus);
      return { path, indexStatus, worktreeStatus, kind, isDenied: isDenied(path) };
    });
}

function parseNumstat(
  output: string,
  statusByPath: Map<string, GitFileStatus>,
  isDenied: (path: string) => boolean
): GitDiffStat[] {
  const stats = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line): GitDiffStat => {
      const [insertRaw = "0", deleteRaw = "0", ...pathParts] = line.split(/\s+/);
      const path = pathParts.join(" ");
      const status = statusByPath.get(path);
      return {
        path,
        insertions: Number(insertRaw) || 0,
        deletions: Number(deleteRaw) || 0,
        status: status?.kind ?? "modified",
        isDenied: isDenied(path)
      };
    });

  for (const status of statusByPath.values()) {
    if (!stats.some((stat) => stat.path === status.path)) {
      stats.push({ path: status.path, insertions: 0, deletions: 0, status: status.kind, isDenied: status.isDenied });
    }
  }

  return stats;
}

function statusKind(indexStatus: string, worktreeStatus: string): GitFileStatusKind {
  const code = `${indexStatus}${worktreeStatus}`;
  if (code.includes("U") || code === "AA" || code === "DD") return "conflicted";
  if (indexStatus === "?" && worktreeStatus === "?") return "untracked";
  if (indexStatus === "R" || worktreeStatus === "R") return "renamed";
  if (indexStatus === "A" || worktreeStatus === "A") return "added";
  if (indexStatus === "D" || worktreeStatus === "D") return "deleted";
  if (indexStatus === "M" || worktreeStatus === "M") return "modified";
  return "unknown";
}

function sanitizeDiff(output: string, isDenied: (path: string) => boolean): string {
  const lines = output.split(/\r?\n/);
  const sanitized: string[] = [];
  let deniedBlock = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const path = match?.[2] ?? match?.[1] ?? "";
      deniedBlock = isDenied(path);
      sanitized.push(deniedBlock ? `diff --git [denied path redacted]` : line);
      if (deniedBlock) sanitized.push("[diff redacted by Git policy]");
      continue;
    }
    if (!deniedBlock) sanitized.push(line);
  }

  return sanitized.join("\n");
}

function createCommitPlan(worktree: GitWorktreeRecord, diff: GitDiffSummary, baseBranch: string): GitCommitPlanOutput {
  const safeFiles = diff.files.filter((file) => !file.isDenied).map((file) => file.path);
  const ready = !worktree.isClean && !worktree.hasDeniedChanges && safeFiles.length > 0;
  const branchName = `codex/${slugify(worktree.summary) || "local-changes"}`;
  const commitMessage = safeFiles.length === 1 ? `Update ${safeFiles[0]}` : `Update ${safeFiles.length} local files`;
  const risks = [
    ...(worktree.hasDeniedChanges ? ["Denied paths changed; review or remove secret/generated files before Git action."] : []),
    ...(ready ? [] : ["No safe changed-file evidence is available for a commit."]),
    `Base branch assumed as ${baseBranch}; confirm before remote PR work.`
  ];
  return {
    branchName,
    commitMessage,
    summary: ready
      ? `Prepare a local commit for ${safeFiles.length} file(s) with ${diff.insertions} insertion(s) and ${diff.deletions} deletion(s).`
      : "Commit plan is blocked because the worktree is clean or contains denied changes.",
    changedFiles: safeFiles,
    requiredEvidence: ["Patch artifact", "Test run evidence", "Tech Lead review", "QA review"],
    risks,
    reviewers: ["tech_lead", "automation_qa"],
    ready
  };
}

function createPullRequestDraft(
  commitPlan: GitCommitPlanOutput,
  baseBranch: string,
  allowPullRequestCreate: boolean
): GitPullRequestDraft {
  const body = [
    "## Summary",
    commitPlan.summary,
    "",
    "## Changed Files",
    ...commitPlan.changedFiles.map((file) => `- ${file}`),
    "",
    "## Evidence Required",
    ...commitPlan.requiredEvidence.map((item) => `- ${item}`),
    "",
    "## Risks",
    ...commitPlan.risks.map((risk) => `- ${risk}`)
  ].join("\n");

  return {
    title: commitPlan.commitMessage,
    body,
    baseBranch,
    headBranch: commitPlan.branchName,
    changedFiles: commitPlan.changedFiles,
    testEvidence: commitPlan.requiredEvidence.filter((item) => item.toLowerCase().includes("test")),
    riskSummary: commitPlan.risks.join(" "),
    status: allowPullRequestCreate ? "ready_to_create" : "integration_needed"
  };
}

function runGit(cwd: string, args: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("git", [...args], {
      cwd,
      shell: false,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        GIT_TERMINAL_PROMPT: "0",
        GIT_PAGER: "cat"
      }
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    const abort = () => {
      child.kill("SIGTERM");
      rejectPromise(new GitExecutionError("command_failed", "Git command was aborted."));
    };

    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      rejectPromise(new GitExecutionError("git_unavailable", error.message));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (timedOut) {
        rejectPromise(new GitExecutionError("command_failed", `Git command exceeded ${timeoutMs}ms.`));
        return;
      }
      if ((exitCode ?? 1) !== 0) {
        rejectPromise(new GitExecutionError("command_failed", stderr.trim() || `git ${args.join(" ")} failed.`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

async function ensureRepository(cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  try {
    const result = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"], timeoutMs, signal);
    if (result.stdout.trim() !== "true") throw new GitExecutionError("not_git_repository", "Path is not inside a Git worktree.");
  } catch (error) {
    if (error instanceof GitExecutionError && error.code === "command_failed") {
      throw new GitExecutionError("not_git_repository", error.message);
    }
    throw error;
  }
}

function requireCwd(decision: GitPolicyDecision): string {
  if (!decision.normalizedCwd) throw new GitExecutionError("policy_denied", "Git policy did not produce a normalized cwd.");
  return decision.normalizedCwd;
}

function errorCodeForPolicy(kind: GitOperationRequest["kind"], reason: string): GitFailureCode {
  if (reason.includes("inside an allowed workspace")) return "path_outside_workspace";
  if (reason.includes("denied")) return "secret_path";
  if (kind === "local_commit") return "commit_disabled";
  return "policy_denied";
}

function isInside(root: string, targetPath: string): boolean {
  const relativePath = relative(root, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !resolve(relativePath).startsWith(".."));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
