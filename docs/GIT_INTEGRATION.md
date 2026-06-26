# Git Integration

Date: 2026-06-19

## Purpose

Phase 4 adds local Git awareness without enabling remote Git automation by default. The Git runner is separate from the generic tool runner so repository actions have their own policy, audit trail, artifacts, and failure codes.

## Runtime Shape

```txt
Mission Control
  -> POST /api/mission/git-operations
  -> GitOperationService
  -> LocalGitRunner
  -> FileGitOperationStore
  -> ArtifactContentStore
  -> Mission session audit/activity
```

## Operations

- `status`: reads branch, short HEAD, and `git status --porcelain=v1`.
- `diff`: captures bounded `git diff --numstat HEAD --` and unified diff evidence.
- `commit_plan`: creates an offline review plan with branch proposal, commit message, changed files, risks, and reviewer roles.
- `local_commit`: creates a local commit only when `allowGitCommit` is enabled.
- `pr_draft`: creates offline PR title/body metadata and returns `integration_needed` unless remote PR creation policy exists.
- `remote_health`: reads the configured `origin` remote, default branch, remote HEAD SHA, upstream ahead/behind state, and best-effort GitHub auth/repository access without storing credentials or mutating the remote.
- `remote_evidence`: reads branch publication, remote commit, PR status, check summary, retry reason, and blocked remote actions without mutating the remote.
- `branch_push_policy`: evaluates future branch-push readiness without pushing. It records actor, `codex/*` branch, commit SHA, remote target, permission state, reviewed delivery evidence, blockers, force-push disabled state, and branch-deletion disabled state.
- `draft_pr_policy`: evaluates future draft-PR readiness without creating a PR. It uses the same reviewed delivery and branch policy checks while honoring separate PR creation permission.
- `branch_push`: pushes the current clean `codex/*` branch to `origin` with upstream tracking only when remote push permission, reviewed delivery evidence, passing local CI, required reviewer approvals, implementation patch evidence, branch policy, remote health, and worktree checks all pass. It never force-pushes and never deletes branches.
- `draft_pr_create`: creates a GitHub draft pull request with `gh pr create --draft` only when PR creation permission, reviewed delivery evidence, passing local CI, required reviewer approvals, implementation patch evidence, branch policy, remote health, and remote branch commit checks all pass. The PR body is hydrated from reviewed delivery Markdown plus implementation patch, rendered preview, CI, review, delivery, and remote safety evidence.

## Default Policy

The default orchestrator policy is local and read-oriented:

- workspace root: `TEAM_AI_AGENT_WORKSPACE_ROOT` or `process.cwd()`;
- Git read is enabled unless `TEAM_AI_AGENT_ALLOW_GIT_READ=false`;
- remote read health is enabled unless `TEAM_AI_AGENT_ALLOW_GIT_REMOTE_READ=false`;
- local commit is disabled unless `TEAM_AI_AGENT_ALLOW_GIT_COMMIT=true`;
- remote push is disabled unless `TEAM_AI_AGENT_ALLOW_GIT_PUSH=true`;
- remote PR creation is disabled unless `TEAM_AI_AGENT_ALLOW_PR_CREATE=true`;
- denied paths include `.env`, `.env.local`, `.env.production`, `.data`, `node_modules`, `dist`, `coverage`, private key patterns, and local SSH key names;
- commands run through `spawn` with `shell: false`;
- environment is reduced to `PATH`, `HOME`, `GIT_TERMINAL_PROMPT=0`, and `GIT_PAGER=cat`;
- diff capture is bounded by `TEAM_AI_AGENT_GIT_MAX_DIFF_BYTES`.

Runtime env switches:

- `TEAM_AI_AGENT_GIT_OPERATION_STORE_PATH=.data/git-operations.json`
- `TEAM_AI_AGENT_ALLOW_GIT_READ=false`
- `TEAM_AI_AGENT_ALLOW_GIT_REMOTE_READ=false`
- `TEAM_AI_AGENT_ALLOW_GIT_COMMIT=true`
- `TEAM_AI_AGENT_ALLOW_GIT_PUSH=true`
- `TEAM_AI_AGENT_ALLOW_PR_CREATE=true`
- `TEAM_AI_AGENT_GIT_TIMEOUT_MS=30000`
- `TEAM_AI_AGENT_GIT_MAX_DIFF_BYTES=120000`

Remote mutation operations also require an explicit `reviewPacketId` whose packet belongs to the same mission/task, is `delivered`, has passing local CI, has every required reviewer recorded as `pass`, has a delivery artifact content id, and carries implementation patch artifacts for both the preview manifest and an allowlisted generated surface module. Draft PR creation verifies that the remote `codex/*` branch exists and matches the local HEAD before invoking GitHub CLI.

## API

- `GET /api/mission/git-policy`
- `GET /api/mission/git-operations?missionId=...`
- `POST /api/mission/git-operations`
- `GET /api/mission/git-operations/:operationId`

Example status body:

```json
{
  "missionId": "bench_multi_role_full_feature",
  "taskId": "task-git-status",
  "roleId": "tech_lead",
  "kind": "status"
}
```

Example commit-plan body:

```json
{
  "missionId": "bench_multi_role_full_feature",
  "taskId": "task-git-commit-plan",
  "roleId": "tech_lead",
  "kind": "commit_plan",
  "baseBranch": "main"
}
```

## Mission Control

The inspector now includes a Git Integration card with:

- current Git policy state;
- read-only remote health for `origin`, including repository, default branch, branch drift, remote access, and GitHub auth availability when the remote is hosted on GitHub;
- read-only remote publication evidence for a target branch, including local-only/current/stale state, remote commit, PR state, status checks, retry reason, and blocked remote actions;
- status, commit-plan, PR-draft, branch-push policy, draft-PR policy, policy-gated branch push, and policy-gated draft-PR creation actions;
- the latest remote mutation policy summary, including target branch, delivery evidence state, and disabled force-push/branch-deletion states;
- latest Git operation history;
- artifact memory entries from remote health, remote publication evidence, remote mutation policy, branch push, draft pull request, Git diff, commit plan, PR draft, and local commit evidence.

In the current project workspace, the repository root may not itself be a Git repository. In that case the UI records a failed `not_git_repository` operation cleanly. Deterministic verification uses temporary Git repositories for success, blocked, and enabled-local-commit paths.

## Verification

- `npm run verify:git-runner`
- `npm run verify:orchestrator`
- `npm run typecheck`
- `npm run build:web`

The verification covers status parsing, dirty/untracked files, denied secret paths, diff redaction, commit-plan blocking, offline PR drafts, default local-commit blocking, read-only remote health, read-only remote publication evidence, remote mutation policy preflight, reviewed delivery evidence gating, default branch-push and draft-PR creation blocking, enabled branch push to a local bare remote, fake-`gh` draft PR creation and PR-status evidence with reviewed delivery Markdown, policy-enabled local commits in a temp repository, persistence, reset, and HTTP endpoints.
