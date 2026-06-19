import { spawn } from "node:child_process";
import { relative, resolve, sep } from "node:path";
import type {
  GitBranchPushResult,
  GitCommitPlanOutput,
  GitDiffStat,
  GitDiffSummary,
  GitDraftPullRequestResult,
  GitFailureCode,
  GitFileStatus,
  GitFileStatusKind,
  GitOperationRequest,
  GitOperationResult,
  GitPolicyDecision,
  GitPolicySnapshot,
  GitPullRequestDraft,
  GitRemoteChecksEvidence,
  GitRemoteEvidence,
  GitRemoteHealth,
  GitRemotePullRequestEvidence,
  GitRemoteMutationKind,
  GitRemoteMutationPolicy,
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
  allowRemoteRead?: boolean;
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
      allowRemoteRead: options.allowRemoteRead ?? true,
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

    if (requiresRemoteRead(request.kind) && !this.policy.allowRemoteRead) {
      return { allowed: false, normalizedCwd, reason: "Git remote read operations are disabled by policy." };
    }

    if (request.kind === "local_commit" && !this.policy.allowGitCommit) {
      return { allowed: false, normalizedCwd, reason: "Local Git commits are disabled by policy." };
    }

    if (request.kind === "branch_push" && !this.policy.allowRemotePush) {
      return { allowed: false, normalizedCwd, reason: "Branch push is disabled by policy." };
    }

    if (request.kind === "draft_pr_create" && !this.policy.allowPullRequestCreate) {
      return { allowed: false, normalizedCwd, reason: "Draft PR creation is disabled by policy." };
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
    if (request.kind === "remote_health") return this.remoteHealth(request, decision, started, signal);
    if (request.kind === "remote_evidence") return this.remoteEvidence(request, decision, started, signal);
    if (request.kind === "branch_push_policy") return this.remoteMutationPolicy(request, decision, started, "branch_push", signal);
    if (request.kind === "draft_pr_policy") return this.remoteMutationPolicy(request, decision, started, "draft_pr", signal);
    if (request.kind === "branch_push") return this.branchPush(request, decision, started, signal);
    if (request.kind === "draft_pr_create") return this.draftPrCreate(request, decision, started, signal);
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

  private async remoteHealth(
    request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const remoteName = "origin";
    const worktree = await this.readWorktree(cwd, signal);
    const remoteUrlResult = await tryRunGit(cwd, ["config", "--get", `remote.${remoteName}.url`], this.policy.timeoutMs, signal);
    const checkedAt = new Date().toISOString();

    if (!remoteUrlResult.ok) {
      const remoteHealth: GitRemoteHealth = {
        remoteName,
        provider: "unknown",
        repository: "No origin remote",
        sanitizedUrl: "not configured",
        defaultBranch: request.baseBranch ?? "main",
        currentBranch: worktree.branch,
        localHeadSha: worktree.headSha,
        access: "not_configured",
        checkedAt,
        summary: "No origin remote is configured for this repository."
      };
      return {
        summary: remoteHealth.summary,
        evidence: [`Branch: ${worktree.branch}`, "Remote: not configured", `Access: ${remoteHealth.access}`],
        durationMs: Date.now() - started,
        worktree,
        remoteHealth
      };
    }

    const rawUrl = remoteUrlResult.stdout.trim();
    const sanitizedUrl = sanitizeRemoteUrl(rawUrl);
    const provider = detectRemoteProvider(rawUrl);
    const repository = repositoryFromRemoteUrl(rawUrl);
    const remoteHead = await readRemoteHead(cwd, remoteName, request.baseBranch ?? "main", this.policy.timeoutMs, signal);
    const tracking = await readTrackingStatus(cwd, this.policy.timeoutMs, signal);
    const github = provider === "github" ? await readGitHubStatus(repository, this.policy.timeoutMs, signal) : undefined;
    const access = remoteHead.access;
    const defaultBranch = github?.defaultBranch ?? remoteHead.defaultBranch;
    const remoteHealth: GitRemoteHealth = {
      remoteName,
      provider,
      repository,
      sanitizedUrl,
      defaultBranch,
      currentBranch: worktree.branch,
      localHeadSha: worktree.headSha,
      ...(remoteHead.sha ? { remoteHeadSha: remoteHead.sha.slice(0, 12) } : {}),
      ...(tracking.trackingBranch ? { trackingBranch: tracking.trackingBranch } : {}),
      ...(tracking.ahead !== undefined ? { ahead: tracking.ahead } : {}),
      ...(tracking.behind !== undefined ? { behind: tracking.behind } : {}),
      access,
      ...(github ? { githubAuthenticated: github.authenticated } : {}),
      ...(github?.viewer ? { githubViewer: github.viewer } : {}),
      checkedAt,
      summary: remoteHealthSummary(repository, worktree.branch, defaultBranch, access, tracking)
    };

    return {
      summary: remoteHealth.summary,
      evidence: [
        `Repository: ${remoteHealth.repository}`,
        `Remote: ${remoteHealth.remoteName}`,
        `Provider: ${remoteHealth.provider}`,
        `Default branch: ${remoteHealth.defaultBranch}`,
        `Local branch: ${remoteHealth.currentBranch}`,
        `Remote access: ${remoteHealth.access}`,
        ...(remoteHealth.remoteHeadSha ? [`Remote HEAD: ${remoteHealth.remoteHeadSha}`] : []),
        ...(remoteHealth.trackingBranch ? [`Tracking: ${remoteHealth.trackingBranch}`] : []),
        ...(remoteHealth.ahead !== undefined && remoteHealth.behind !== undefined ? [`Ahead/behind: ${remoteHealth.ahead}/${remoteHealth.behind}`] : []),
        ...(remoteHealth.githubAuthenticated !== undefined ? [`GitHub auth: ${remoteHealth.githubAuthenticated ? "available" : "unavailable"}`] : [])
      ],
      durationMs: Date.now() - started,
      worktree,
      remoteHealth
    };
  }

  private async remoteMutationPolicy(
    request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    mutationKind: GitRemoteMutationKind,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const remoteResult = await this.remoteHealth(request, decision, started, signal);
    const worktree = remoteResult.worktree!;
    const remoteHealth = remoteResult.remoteHealth!;
    const diff = await this.readDiff(cwd, signal);
    const commitPlan = createCommitPlan(worktree, diff, request.baseBranch ?? "main");
    const prDraft = mutationKind === "draft_pr"
      ? createPullRequestDraft(commitPlan, request.baseBranch ?? remoteHealth.defaultBranch, this.policy.allowPullRequestCreate)
      : undefined;
    const remoteMutationPolicy = createRemoteMutationPolicy({
      actorRoleId: request.roleId,
      baseBranch: request.baseBranch ?? remoteHealth.defaultBranch,
      branchName: request.branchName?.trim() || commitPlan.branchName,
      commitSha: worktree.headSha,
      mutationKind,
      permissionAllowed: mutationKind === "branch_push" ? this.policy.allowRemotePush : this.policy.allowPullRequestCreate,
      remoteHealth,
      worktree
    });

    return {
      summary: remoteMutationPolicy.reason,
      evidence: [
        `Mutation: ${remoteMutationPolicy.mutationKind}`,
        `Actor: ${remoteMutationPolicy.actorRoleId}`,
        `Branch: ${remoteMutationPolicy.branchName}`,
        `Commit: ${remoteMutationPolicy.commitSha}`,
        `Remote target: ${remoteMutationPolicy.remoteTarget}`,
        `Permission allowed: ${String(remoteMutationPolicy.permissionAllowed)}`,
        `Reviewed delivery present: ${String(remoteMutationPolicy.reviewedDeliveryPresent)}`,
        `Force push allowed: ${String(remoteMutationPolicy.forcePushAllowed)}`,
        `Branch deletion allowed: ${String(remoteMutationPolicy.branchDeletionAllowed)}`,
        ...remoteMutationPolicy.blockers.map((blocker) => `Blocker: ${blocker}`)
      ],
      durationMs: Date.now() - started,
      worktree,
      diff,
      commitPlan,
      ...(prDraft ? { prDraft } : {}),
      remoteHealth,
      remoteMutationPolicy
    };
  }

  private async remoteEvidence(
    request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const remoteResult = await this.remoteHealth(request, decision, started, signal);
    const worktree = remoteResult.worktree!;
    const remoteHealth = remoteResult.remoteHealth!;
    const branchName = request.branchName?.trim() || worktree.branch;
    const localCommitSha = await readFullHeadSha(cwd, this.policy.timeoutMs, signal);
    const remoteCommitSha = remoteHealth.access === "ok"
      ? await readRemoteBranchSha(cwd, remoteHealth.remoteName, branchName, this.policy.timeoutMs, signal)
      : undefined;
    const publicationState = publicationStateFor(remoteHealth.access, remoteCommitSha, localCommitSha);
    const githubEvidence = remoteHealth.provider === "github" && remoteHealth.access === "ok"
      ? await readGitHubPullRequestEvidence(cwd, branchName, this.policy.timeoutMs, signal)
      : {
        pullRequest: createNoPullRequestEvidence(remoteHealth.provider),
        checks: createNoChecksEvidence(remoteHealth.provider)
      };
    const retryReason = retryReasonFor(remoteHealth.access, githubEvidence.retryReason);
    const remoteEvidence: GitRemoteEvidence = {
      remoteName: remoteHealth.remoteName,
      provider: remoteHealth.provider,
      repository: remoteHealth.repository,
      branchName,
      defaultBranch: remoteHealth.defaultBranch,
      localCommitSha,
      ...(remoteCommitSha ? { remoteCommitSha } : {}),
      publicationState,
      pullRequest: githubEvidence.pullRequest,
      checks: githubEvidence.checks,
      blockedActions: [
        "Merge remains a human decision.",
        "Deployment and production actions are disabled.",
        "Force push is disabled.",
        "Branch deletion is disabled."
      ],
      retryable: Boolean(retryReason),
      ...(retryReason ? { retryReason } : {}),
      checkedAt: new Date().toISOString(),
      summary: remoteEvidenceSummary(remoteHealth.repository, branchName, publicationState, githubEvidence.pullRequest, githubEvidence.checks)
    };

    return {
      summary: remoteEvidence.summary,
      evidence: [
        `Repository: ${remoteEvidence.repository}`,
        `Branch: ${remoteEvidence.branchName}`,
        `Publication: ${remoteEvidence.publicationState}`,
        `Local commit: ${remoteEvidence.localCommitSha}`,
        ...(remoteEvidence.remoteCommitSha ? [`Remote commit: ${remoteEvidence.remoteCommitSha}`] : []),
        `PR: ${remoteEvidence.pullRequest.summary}`,
        `Checks: ${remoteEvidence.checks.summary}`,
        `Retryable: ${String(remoteEvidence.retryable)}`,
        ...remoteEvidence.blockedActions.map((item) => `Blocked action: ${item}`)
      ],
      durationMs: Date.now() - started,
      worktree,
      remoteHealth,
      remoteEvidence
    };
  }

  private async branchPush(
    request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const preflight = await this.remoteMutationPolicy(request, decision, started, "branch_push", signal);
    const policy = preflight.remoteMutationPolicy!;
    const remoteHealth = preflight.remoteHealth!;
    if (!policy.allowed) throw new GitExecutionError("remote_disabled", policy.reason);

    await runGit(cwd, ["push", "-u", policy.remoteName, `HEAD:refs/heads/${policy.branchName}`], this.policy.timeoutMs, signal);
    const remoteSha = await readRemoteBranchSha(cwd, policy.remoteName, policy.branchName, this.policy.timeoutMs, signal);
    if (!remoteSha) throw new GitExecutionError("command_failed", `Remote branch ${policy.branchName} was not found after push.`);
    const localSha = await readFullHeadSha(cwd, this.policy.timeoutMs, signal);
    if (remoteSha !== localSha) {
      throw new GitExecutionError("command_failed", `Remote branch ${policy.branchName} does not match local HEAD after push.`);
    }

    const pushedAt = new Date().toISOString();
    const branchPush: GitBranchPushResult = {
      remoteName: policy.remoteName,
      branchName: policy.branchName,
      commitSha: localSha,
      remoteTarget: policy.remoteTarget,
      trackingBranch: `${policy.remoteName}/${policy.branchName}`,
      pushedAt,
      summary: `Pushed ${policy.branchName} to ${policy.remoteName} at ${localSha.slice(0, 12)}.`
    };
    const worktree = await this.readWorktree(cwd, signal);

    return {
      summary: branchPush.summary,
      evidence: [
        `Remote: ${branchPush.remoteName}`,
        `Branch: ${branchPush.branchName}`,
        `Commit: ${branchPush.commitSha}`,
        `Tracking: ${branchPush.trackingBranch}`,
        "Force push: disabled",
        "Branch deletion: disabled"
      ],
      durationMs: Date.now() - started,
      worktree,
      remoteHealth,
      remoteMutationPolicy: policy,
      branchPush
    };
  }

  private async draftPrCreate(
    request: GitExecutionRequest,
    decision: GitPolicyDecision,
    started: number,
    signal?: AbortSignal
  ): Promise<GitOperationResult> {
    const cwd = requireCwd(decision);
    const preflight = await this.remoteMutationPolicy(request, decision, started, "draft_pr", signal);
    const policy = preflight.remoteMutationPolicy!;
    const worktree = preflight.worktree!;
    const commitPlan = preflight.commitPlan!;
    const remoteHealth = preflight.remoteHealth!;
    if (!policy.allowed) throw new GitExecutionError("remote_disabled", policy.reason);

    const remoteSha = await readRemoteBranchSha(cwd, policy.remoteName, policy.branchName, this.policy.timeoutMs, signal);
    const localSha = await readFullHeadSha(cwd, this.policy.timeoutMs, signal);
    if (!remoteSha) throw new GitExecutionError("remote_disabled", `Remote branch ${policy.branchName} must be pushed before draft PR creation.`);
    if (remoteSha !== localSha) throw new GitExecutionError("remote_disabled", `Remote branch ${policy.branchName} does not match local HEAD.`);

    const prDraft = preflight.prDraft ?? createPullRequestDraft(commitPlan, policy.baseBranch, this.policy.allowPullRequestCreate);
    const title = request.pullRequestTitle?.trim() || prDraft.title;
    const body = request.pullRequestBody?.trim() || prDraft.body;
    const prResult = await runProcess(
      "gh",
      ["pr", "create", "--draft", "--base", policy.baseBranch, "--head", policy.branchName, "--title", title, "--body", body],
      cwd,
      this.policy.timeoutMs,
      signal
    );
    const url = parsePullRequestUrl(`${prResult.stdout}\n${prResult.stderr}`);
    if (!url) throw new GitExecutionError("command_failed", "GitHub CLI did not return a pull request URL.");

    const createdAt = new Date().toISOString();
    const number = parsePullRequestNumber(url);
    const draftPullRequest: GitDraftPullRequestResult = {
      url,
      ...(number !== undefined ? { number } : {}),
      title,
      body,
      baseBranch: policy.baseBranch,
      headBranch: policy.branchName,
      remoteTarget: policy.remoteTarget,
      draft: true,
      createdAt,
      summary: `Created draft PR for ${policy.branchName} into ${policy.baseBranch}.`
    };

    return {
      summary: draftPullRequest.summary,
      evidence: [
        `PR: ${draftPullRequest.url}`,
        `Draft: ${String(draftPullRequest.draft)}`,
        `Base: ${draftPullRequest.baseBranch}`,
        `Head: ${draftPullRequest.headBranch}`,
        `Remote commit: ${remoteSha}`
      ],
      durationMs: Date.now() - started,
      worktree,
      commitPlan,
      prDraft,
      remoteHealth,
      remoteMutationPolicy: policy,
      draftPullRequest
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

function createRemoteMutationPolicy(input: {
  actorRoleId: GitRemoteMutationPolicy["actorRoleId"];
  baseBranch: string;
  branchName: string;
  commitSha: string;
  mutationKind: GitRemoteMutationKind;
  permissionAllowed: boolean;
  remoteHealth: GitRemoteHealth;
  worktree: GitWorktreeRecord;
}): GitRemoteMutationPolicy {
  const blockers = [
    ...(input.permissionAllowed ? [] : [`${input.mutationKind === "branch_push" ? "Branch push" : "Draft PR creation"} is disabled by policy.`]),
    ...(input.remoteHealth.access === "ok" ? [] : [`Remote access is ${input.remoteHealth.access}.`]),
    ...(isAllowedCodexBranch(input.branchName) ? [] : ["Remote mutations must target a codex/* branch."]),
    ...(input.worktree.branch === input.branchName ? [] : [`Current branch ${input.worktree.branch} must match target branch ${input.branchName}.`]),
    ...(input.branchName === input.baseBranch || ["main", "master"].includes(input.branchName) ? ["Remote mutations cannot target the protected base branch."] : []),
    ...(input.worktree.hasDeniedChanges ? ["Denied path changes are present in the worktree."] : []),
    ...(!input.worktree.isClean ? ["Worktree has uncommitted changes; remote mutation must target a committed SHA."] : [])
  ];
  const allowed = blockers.length === 0;

  return {
    mutationKind: input.mutationKind,
    allowed,
    reason: allowed
      ? `${input.mutationKind === "branch_push" ? "Branch push" : "Draft PR creation"} policy preflight passed.`
      : `${input.mutationKind === "branch_push" ? "Branch push" : "Draft PR creation"} policy preflight blocked by ${blockers.length} requirement(s).`,
    actorRoleId: input.actorRoleId,
    branchName: input.branchName,
    commitSha: input.commitSha,
    remoteName: input.remoteHealth.remoteName,
    remoteTarget: input.remoteHealth.repository,
    baseBranch: input.baseBranch,
    permissionAllowed: input.permissionAllowed,
    reviewedDeliveryRequired: true,
    reviewedDeliveryPresent: false,
    forcePushAllowed: false,
    branchDeletionAllowed: false,
    blockers,
    checkedAt: new Date().toISOString()
  };
}

function isAllowedCodexBranch(branchName: string): boolean {
  return /^codex\/[a-z0-9][a-z0-9._/-]*$/i.test(branchName) && !branchName.includes("..") && !branchName.endsWith("/");
}

function requiresRemoteRead(kind: GitOperationRequest["kind"]): boolean {
  return kind === "remote_health" || kind === "remote_evidence" || kind === "branch_push_policy" || kind === "draft_pr_policy" || kind === "branch_push" || kind === "draft_pr_create";
}

function publicationStateFor(
  access: GitRemoteHealth["access"],
  remoteCommitSha: string | undefined,
  localCommitSha: string
): GitRemoteEvidence["publicationState"] {
  if (access !== "ok") return "unknown";
  if (!remoteCommitSha) return "local_only";
  return remoteCommitSha === localCommitSha ? "published_current" : "published_stale";
}

async function readGitHubPullRequestEvidence(
  cwd: string,
  branchName: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ pullRequest: GitRemotePullRequestEvidence; checks: GitRemoteChecksEvidence; retryReason?: string }> {
  const result = await tryRunProcess(
    "gh",
    ["pr", "view", branchName, "--json", "number,url,state,isDraft,title,headRefName,baseRefName,mergeStateStatus,statusCheckRollup"],
    cwd,
    timeoutMs,
    signal
  );

  if (!result.ok) {
    const lowered = result.message.toLowerCase();
    if (lowered.includes("no pull requests") || lowered.includes("not found")) {
      return { pullRequest: createNoPullRequestEvidence("github"), checks: createNoChecksEvidence("github") };
    }
    return {
      pullRequest: { state: "unknown", summary: "Pull request status is unavailable." },
      checks: { state: "unknown", total: 0, passed: 0, pending: 0, failed: 0, summary: "Check status is unavailable." },
      retryReason: `GitHub PR status unavailable: ${result.message}`
    };
  }

  try {
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    const state = mapPullRequestState(payload.state);
    const number = typeof payload.number === "number" ? payload.number : undefined;
    const url = typeof payload.url === "string" ? payload.url : undefined;
    const title = typeof payload.title === "string" ? payload.title : undefined;
    const draft = typeof payload.isDraft === "boolean" ? payload.isDraft : undefined;
    const headBranch = typeof payload.headRefName === "string" ? payload.headRefName : undefined;
    const baseBranch = typeof payload.baseRefName === "string" ? payload.baseRefName : undefined;
    const mergeStateStatus = typeof payload.mergeStateStatus === "string" ? payload.mergeStateStatus : undefined;
    const pullRequest: GitRemotePullRequestEvidence = {
      state,
      ...(url ? { url } : {}),
      ...(number !== undefined ? { number } : {}),
      ...(title ? { title } : {}),
      ...(draft !== undefined ? { draft } : {}),
      ...(headBranch ? { headBranch } : {}),
      ...(baseBranch ? { baseBranch } : {}),
      ...(mergeStateStatus ? { mergeStateStatus } : {}),
      summary: state === "none"
        ? "No pull request found."
        : `${draft ? "Draft " : ""}PR${number !== undefined ? ` #${number}` : ""} is ${state}.`
    };
    return { pullRequest, checks: summarizeChecks(payload.statusCheckRollup) };
  } catch (error) {
    return {
      pullRequest: { state: "unknown", summary: "Pull request status could not be parsed." },
      checks: { state: "unknown", total: 0, passed: 0, pending: 0, failed: 0, summary: "Check status could not be parsed." },
      retryReason: error instanceof Error ? `GitHub PR status parse failed: ${error.message}` : "GitHub PR status parse failed."
    };
  }
}

function createNoPullRequestEvidence(provider: GitRemoteHealth["provider"]): GitRemotePullRequestEvidence {
  return { state: "none", summary: provider === "github" ? "No pull request found." : "Pull request status is not available for this remote." };
}

function createNoChecksEvidence(provider: GitRemoteHealth["provider"]): GitRemoteChecksEvidence {
  return {
    state: "none",
    total: 0,
    passed: 0,
    pending: 0,
    failed: 0,
    summary: provider === "github" ? "No check runs found." : "Check status is not available for this remote."
  };
}

function mapPullRequestState(value: unknown): GitRemotePullRequestEvidence["state"] {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (normalized === "open") return "open";
  if (normalized === "closed") return "closed";
  if (normalized === "merged") return "merged";
  return "unknown";
}

function summarizeChecks(value: unknown): GitRemoteChecksEvidence {
  if (!Array.isArray(value) || value.length === 0) return createNoChecksEvidence("github");

  let passed = 0;
  let pending = 0;
  let failed = 0;

  for (const item of value) {
    if (!item || typeof item !== "object") {
      pending += 1;
      continue;
    }
    const record = item as Record<string, unknown>;
    const status = String(record.status ?? "").toLowerCase();
    const conclusion = String(record.conclusion ?? "").toLowerCase();
    if (["success", "skipped", "neutral"].includes(conclusion)) {
      passed += 1;
    } else if (["failure", "cancelled", "timed_out", "action_required"].includes(conclusion)) {
      failed += 1;
    } else if (status === "completed" && conclusion && !["success", "skipped", "neutral"].includes(conclusion)) {
      failed += 1;
    } else {
      pending += 1;
    }
  }

  const total = value.length;
  const state: GitRemoteChecksEvidence["state"] = failed > 0 ? "failing" : pending > 0 ? "pending" : "passing";
  return {
    state,
    total,
    passed,
    pending,
    failed,
    summary: `${passed}/${total} checks passing${pending > 0 ? `, ${pending} pending` : ""}${failed > 0 ? `, ${failed} failing` : ""}.`
  };
}

function retryReasonFor(access: GitRemoteHealth["access"], githubRetryReason: string | undefined): string | undefined {
  if (githubRetryReason) return githubRetryReason;
  if (access === "unavailable") return "Remote network is unavailable. Retry remote evidence later.";
  if (access === "auth_required") return "Remote authentication is required. Retry after GitHub auth is available.";
  if (access === "error") return "Remote status returned an error. Retry remote evidence later.";
  return undefined;
}

function remoteEvidenceSummary(
  repository: string,
  branchName: string,
  publicationState: GitRemoteEvidence["publicationState"],
  pullRequest: GitRemotePullRequestEvidence,
  checks: GitRemoteChecksEvidence
): string {
  const publication = publicationState.replaceAll("_", " ");
  return `${repository} ${branchName} is ${publication}; ${pullRequest.summary} ${checks.summary}`;
}

type RemoteHeadStatus = {
  access: GitRemoteHealth["access"];
  defaultBranch: string;
  sha?: string;
};

type TrackingStatus = {
  trackingBranch?: string;
  ahead?: number;
  behind?: number;
};

type GitHubStatus = {
  authenticated: boolean;
  defaultBranch?: string;
  viewer?: string;
};

async function readRemoteHead(
  cwd: string,
  remoteName: string,
  fallbackBranch: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<RemoteHeadStatus> {
  const symref = await tryRunGit(cwd, ["ls-remote", "--symref", remoteName, "HEAD"], timeoutMs, signal);
  if (symref.ok) {
    const defaultBranch = parseRemoteDefaultBranch(symref.stdout) ?? fallbackBranch;
    const sha = parseRemoteHeadSha(symref.stdout);
    return { access: "ok", defaultBranch, ...(sha ? { sha } : {}) };
  }

  const direct = await tryRunGit(cwd, ["ls-remote", "--heads", remoteName, fallbackBranch], timeoutMs, signal);
  if (direct.ok) {
    const sha = parseFirstSha(direct.stdout);
    return { access: "ok", defaultBranch: fallbackBranch, ...(sha ? { sha } : {}) };
  }

  return { access: remoteAccessStatus(symref.message || direct.message), defaultBranch: fallbackBranch };
}

async function readTrackingStatus(cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<TrackingStatus> {
  const trackingResult = await tryRunGit(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], timeoutMs, signal);
  if (!trackingResult.ok) return {};

  const trackingBranch = trackingResult.stdout.trim();
  const counts = await tryRunGit(cwd, ["rev-list", "--left-right", "--count", `HEAD...${trackingBranch}`], timeoutMs, signal);
  if (!counts.ok) return { trackingBranch };

  const [aheadRaw, behindRaw] = counts.stdout.trim().split(/\s+/);
  return {
    trackingBranch,
    ahead: Number(aheadRaw) || 0,
    behind: Number(behindRaw) || 0
  };
}

async function readGitHubStatus(repository: string, timeoutMs: number, signal?: AbortSignal): Promise<GitHubStatus> {
  const ownerRepo = repository.includes("/") ? repository : "";
  const auth = await tryRunProcess("gh", ["auth", "status", "--hostname", "github.com"], process.cwd(), timeoutMs, signal);
  const viewer = auth.ok ? await tryRunProcess("gh", ["api", "user", "--jq", ".login"], process.cwd(), timeoutMs, signal) : undefined;
  const repo = ownerRepo
    ? await tryRunProcess("gh", ["api", `repos/${ownerRepo}`, "--jq", ".default_branch"], process.cwd(), timeoutMs, signal)
    : undefined;

  return {
    authenticated: auth.ok,
    ...(repo?.ok && repo.stdout.trim() ? { defaultBranch: repo.stdout.trim() } : {}),
    ...(viewer?.ok && viewer.stdout.trim() ? { viewer: viewer.stdout.trim() } : {})
  };
}

function parseRemoteDefaultBranch(output: string): string | undefined {
  const line = output.split(/\r?\n/).find((item) => item.startsWith("ref: refs/heads/") && item.endsWith("\tHEAD"));
  return line?.replace(/^ref: refs\/heads\//, "").replace(/\tHEAD$/, "").trim() || undefined;
}

function parseRemoteHeadSha(output: string): string | undefined {
  const line = output.split(/\r?\n/).find((item) => item.endsWith("\tHEAD") && /^[0-9a-f]{40}\tHEAD$/i.test(item));
  return line?.split(/\s+/)[0];
}

function parseFirstSha(output: string): string | undefined {
  return output.match(/\b[0-9a-f]{40}\b/i)?.[0];
}

async function readRemoteBranchSha(
  cwd: string,
  remoteName: string,
  branchName: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string | undefined> {
  const result = await tryRunGit(cwd, ["ls-remote", "--heads", remoteName, branchName], timeoutMs, signal);
  return result.ok ? parseFirstSha(result.stdout) : undefined;
}

async function readFullHeadSha(cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  return (await runGit(cwd, ["rev-parse", "HEAD"], timeoutMs, signal)).stdout.trim();
}

function parsePullRequestUrl(output: string): string | undefined {
  return output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/i)?.[0];
}

function parsePullRequestNumber(url: string): number | undefined {
  const value = url.match(/\/pull\/(\d+)/)?.[1];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeRemoteUrl(rawUrl: string): string {
  if (!rawUrl) return "unknown";
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return rawUrl.replace(/:\/\/[^/@]+@/, "://");
  }
}

function detectRemoteProvider(rawUrl: string): GitRemoteHealth["provider"] {
  const value = rawUrl.toLowerCase();
  if (value.includes("github.com")) return "github";
  if (value.startsWith("/") || value.startsWith("file:") || value.startsWith("../") || value.startsWith("./")) return "local";
  if (value) return "other";
  return "unknown";
}

function repositoryFromRemoteUrl(rawUrl: string): string {
  const withoutCreds = sanitizeRemoteUrl(rawUrl).replace(/\.git$/, "");
  const sshMatch = withoutCreds.match(/github\.com[:/](.+\/.+)$/i);
  if (sshMatch?.[1]) return sshMatch[1];

  try {
    const url = new URL(withoutCreds);
    return url.hostname.includes("github.com") ? url.pathname.replace(/^\/|\.git$/g, "") : `${url.hostname}${url.pathname}`;
  } catch {
    return withoutCreds.split(/[\\/]/).filter(Boolean).slice(-2).join("/") || "origin";
  }
}

function remoteAccessStatus(message: string): GitRemoteHealth["access"] {
  const lowered = message.toLowerCase();
  if (lowered.includes("authentication failed") || lowered.includes("permission denied") || lowered.includes("could not read username")) {
    return "auth_required";
  }
  if (lowered.includes("not found") || lowered.includes("repository not found")) {
    return "auth_required";
  }
  if (lowered.includes("could not resolve host") || lowered.includes("network") || lowered.includes("timed out")) {
    return "unavailable";
  }
  return "error";
}

function remoteHealthSummary(
  repository: string,
  branch: string,
  defaultBranch: string,
  access: GitRemoteHealth["access"],
  tracking: TrackingStatus
): string {
  if (access !== "ok") return `Remote ${repository} is ${access.replaceAll("_", " ")}.`;
  const drift = tracking.ahead !== undefined && tracking.behind !== undefined ? `; local is ${tracking.ahead} ahead and ${tracking.behind} behind` : "";
  return `Remote ${repository} is reachable on ${defaultBranch}; local branch ${branch}${drift}.`;
}

async function tryRunGit(
  cwd: string,
  args: readonly string[],
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; message: string; code: GitFailureCode }> {
  try {
    const result = await runGit(cwd, args, timeoutMs, signal);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof GitExecutionError ? error.code : "command_failed",
      message: error instanceof Error ? sanitizeProcessMessage(error.message) : "Git command failed."
    };
  }
}

async function tryRunProcess(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; message: string; code: GitFailureCode }> {
  try {
    const result = await runProcess(command, args, cwd, timeoutMs, signal);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof GitExecutionError ? error.code : "command_failed",
      message: error instanceof Error ? sanitizeProcessMessage(error.message) : `${command} command failed.`
    };
  }
}

function sanitizeProcessMessage(message: string): string {
  return message.replace(/:\/\/[^/@\s]+@/g, "://");
}

function runGit(cwd: string, args: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return runProcess("git", args, cwd, timeoutMs, signal);
}

function runProcess(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args], {
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
        rejectPromise(new GitExecutionError("command_failed", `${command} command exceeded ${timeoutMs}ms.`));
        return;
      }
      if ((exitCode ?? 1) !== 0) {
        rejectPromise(new GitExecutionError("command_failed", sanitizeProcessMessage(stderr.trim()) || `${command} ${args.join(" ")} failed.`));
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
  if (kind === "remote_health" && reason.includes("remote read")) return "remote_disabled";
  if ((kind === "branch_push" || kind === "draft_pr_create") && reason.includes("disabled")) return "remote_disabled";
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
