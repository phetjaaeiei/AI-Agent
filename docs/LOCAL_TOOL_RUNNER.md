# Local Tool Runner

Date: 2026-06-19

## Purpose

Phase 3 adds local workspace execution without enabling Git, remote APIs, deployment, or arbitrary shell access. The tool runner is a policy-controlled execution layer for evidence, patches, and test results.

Phase 10 uses the same tool-runner boundary for the autonomous controller implementation-patch stage. The controller does not write files directly; it submits a `file_write` request and records the resulting `Local Code Patch` artifact.

## Runtime Shape

```txt
Mission Control
  -> POST /api/mission/tool-calls
  -> ToolCallService
  -> LocalToolRunner
  -> FileToolCallStore
  -> ArtifactContentStore
  -> Mission session audit/activity
```

## Tools

- `file_read`: reads a file inside the configured workspace and records byte count plus SHA-256 evidence.
- `file_write`: writes a file inside the workspace and creates a `Local Code Patch` artifact with a bounded unified patch.
- `shell_command`: runs only allowlisted local commands through `spawn` with `shell: false`.
- `test_command`: runs allowlisted test/check/build commands and creates test evidence artifacts.

## Default Policy

The default orchestrator policy is local only:

- workspace root: `TEAM_AI_AGENT_WORKSPACE_ROOT` or `process.cwd()`;
- denied paths: `.env`, `.git`, `.data`, `node_modules`, `dist`, `coverage`, private key patterns;
- shell metacharacters are blocked;
- commands run without a shell;
- environment is reduced to `PATH`, `HOME`, `CI=1`, and `NO_COLOR=1`;
- timeout defaults to 30 seconds.

Runtime env switches:

- `TEAM_AI_AGENT_ALLOW_FILE_READ=false`
- `TEAM_AI_AGENT_ALLOW_FILE_WRITE=false`
- `TEAM_AI_AGENT_ALLOW_SHELL=false`
- `TEAM_AI_AGENT_ALLOW_TEST_COMMAND=false`
- `TEAM_AI_AGENT_TOOL_TIMEOUT_MS=30000`
- `TEAM_AI_AGENT_TOOL_CALL_STORE_PATH=.data/tool-calls.json`

## API

- `GET /api/mission/tool-policy`
- `GET /api/mission/tool-calls?missionId=...`
- `POST /api/mission/tool-calls`
- `GET /api/mission/tool-calls/:toolCallId`

Example body:

```json
{
  "missionId": "bench_multi_role_full_feature",
  "taskId": "task-local-typecheck",
  "roleId": "automation_qa",
  "kind": "test_command",
  "command": "npm run typecheck"
}
```

## Verification

- `npm run verify:tool-runner`
- `npm run verify:orchestrator`
- `npm run typecheck`
- `npm run build:web`

The verification covers file read, denied secret paths, outside-workspace paths, file write patch artifacts, passing test evidence, failing test evidence, command blocking, persistence, reset, and HTTP endpoints.

## Mission Control Output Safety

Phase 8 H3 adds a `Command Output` inspector card that summarizes recent tool and Git command evidence. The UI clips previews and redacts the configured workspace root, denied path patterns such as `.env`, bearer tokens, OpenAI-style API keys, and secret-like `key=value` fields before rendering output text. This is a display-safety layer on top of the runner policy; it does not loosen the underlying file, command, or Git execution rules.

## Controller Implementation Patch Usage

Phase 10 P10.1 routes the autonomous controller's first implementation patch through `file_write`:

- current target: `apps/web/src/generated/mission-implementation-preview.ts`;
- evidence: `Local Code Patch` artifact with bounded patch summary;
- failure behavior: the controller stops at `implementation_patch` with `implementation_failed`;
- future expansion: additional patch targets require a dedicated allowlist or policy before becoming automatic.
