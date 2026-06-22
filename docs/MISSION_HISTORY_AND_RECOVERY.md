# Mission History And Run Recovery

Phase 8 H2 adds persisted, read-only recovery for previous local mission runs.

## Archive Contents

Each `MissionHistoryRecord` captures:

- the runtime session and mission intake;
- the controller record and stage results;
- agent runs and persisted events;
- tool calls;
- Git operations;
- review packets and local CI results;
- artifact contents and delivery Markdown.

The archive defaults to `.data/mission-history.json`. Set `TEAM_AI_AGENT_HISTORY_STORE_PATH` to use another local path.

## Capture Points

- completed, blocked, failed, and cancelled controller states;
- the previous terminal attempt before retry;
- the current mission before reset clears active stores.

Archive IDs include controller ID and attempt. Existing IDs are returned unchanged, so later reset or retry behavior cannot rewrite an earlier snapshot.

## REST Endpoints

- `GET /api/mission/history`: current mission summary followed by archived run summaries;
- `GET /api/mission/history/:historyId`: one complete current or archived evidence snapshot.

There is no POST, PUT, retry, resume, commit, push, PR, deploy, or destructive operation under the history route.

## Mission Control

The Mission History strip distinguishes current and archived states. Selecting an archive opens a dedicated read-only inspector with controller stages, evidence counts, agent runs, tool calls, Git operations, review/CI state, and delivery content. Selecting Current returns to the active inspector.

## Safety Boundary

Recovery reads persisted evidence only. It does not replay local commits, branch pushes, draft PR creation, controller retries, tool calls, Git operations, review actions, deployment, production actions, force push, branch deletion, or destructive reset/checkout.
