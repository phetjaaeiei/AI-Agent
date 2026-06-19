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

## Default Policy

The default orchestrator policy is local and read-oriented:

- workspace root: `TEAM_AI_AGENT_WORKSPACE_ROOT` or `process.cwd()`;
- Git read is enabled unless `TEAM_AI_AGENT_ALLOW_GIT_READ=false`;
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
- `TEAM_AI_AGENT_ALLOW_GIT_COMMIT=true`
- `TEAM_AI_AGENT_ALLOW_GIT_PUSH=true`
- `TEAM_AI_AGENT_ALLOW_PR_CREATE=true`
- `TEAM_AI_AGENT_GIT_TIMEOUT_MS=30000`
- `TEAM_AI_AGENT_GIT_MAX_DIFF_BYTES=120000`

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
- status, commit-plan, and PR-draft actions;
- latest Git operation history;
- artifact memory entries from Git diff, commit plan, PR draft, and local commit evidence.

In the current project workspace, the repository root may not itself be a Git repository. In that case the UI records a failed `not_git_repository` operation cleanly. Deterministic verification uses temporary Git repositories for success, blocked, and enabled-local-commit paths.

## Verification

- `npm run verify:git-runner`
- `npm run verify:orchestrator`
- `npm run typecheck`
- `npm run build:web`

The verification covers status parsing, dirty/untracked files, denied secret paths, diff redaction, commit-plan blocking, offline PR drafts, default local-commit blocking, policy-enabled local commits in a temp repository, persistence, reset, and HTTP endpoints.
