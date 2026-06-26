# Autonomous Mission Controller

Phase 6 added a persisted local controller that advances one mission through the existing policy boundaries. Phase 10 extends that controller with a bounded implementation-patch stage before evidence, review, CI, delivery, and handoff policy.

## Stage Flow

```txt
planning
  -> implementation_patch
  -> tool_evidence
  -> git_evidence
  -> review_packet
  -> local_ci
  -> reviewers
  -> delivery
  -> handoff_policy
  -> completed or stopped
```

The controller calls existing agent, tool, Git, review, CI, and artifact services. It does not bypass their policy checks.
The implementation patch stage uses the tool-runner `file_write` policy to write the current bounded preview target, then records the resulting `Local Code Patch` artifact as evidence.
The final handoff policy stage evaluates guarded automation decisions for remote handoff and deployment readiness. Bounded branch push and draft PR creation can execute only through Git-specific policy gates when required evidence and connector policy are present. Merge, deploy, force-push, branch deletion, destructive Git, secret serialization, fine-tuning, and unbounded loop actions remain out of scope.

## Lifecycle

- `queued`: persisted and waiting for execution.
- `running`: executing one bounded stage.
- `completed`: every local stage passed, a delivery report exists, and handoff automation policy was evaluated.
- `blocked`: a policy, evidence, CI, or reviewer gate stopped the mission.
- `failed`: an unexpected internal error stopped execution.
- `cancelled`: the user requested cancellation.

Every stage records attempt number, summary, timestamps, and concrete evidence IDs. Controllers have two attempts by default. Interrupted queued or running records resume when the orchestrator restarts.

## Implementation Patch

The current Phase 10 patch target is:

```txt
apps/web/src/generated/mission-implementation-preview.ts
```

The controller generates a typed preview module from the mission command and writes it through `ToolCallService`. If the local tool-runner blocks the write, the controller stops at `implementation_patch` with `implementation_failed`. The generated file is intentionally narrow for P10.1; future Phase 10 slices can expand implementation generation only after a dedicated path/file-type policy exists.

Phase 10 P10.2 adds a rendered preview surface to that module. Mission Control can render the surface from the generated module before a mission completes, from the latest `Local Code Patch` artifact after execution, and from archived artifact contents during read-only recovery.

Phase 10 P10.3 adds a targeted patch policy before file writes. The controller can write only the preview manifest plus one generated surface module selected from the mission command (`landing`, `dashboard`, or `workflow`). Every target is preflighted against `phase10-targeted-patch-v1` before the generic tool-runner `file_write` policy runs.

## Local Reviewers

Tech Lead, QA Lead, and Lead BA reviewers run independently. Ollama uses structured JSON output when available; deterministic fallback evaluates the same persisted completeness requirements.

Reviewers cannot pass a packet with missing or blocked non-reviewer evidence. A revise decision receives one bounded recheck. A second revise or any block stops the controller.

## REST Endpoints

- `GET /api/mission/controllers?missionId=...`
- `POST /api/mission/controllers`
- `GET /api/mission/controllers/:controllerId`
- `POST /api/mission/controllers/:controllerId/cancel`
- `POST /api/mission/controllers/:controllerId/retry`
- `POST /api/mission/controllers/:controllerId/resume`

Set `TEAM_AI_AGENT_CONTROLLER_STORE_PATH` to override `.data/mission-controllers.json`.

## Recovery And Reset

The default orchestrator recovers interrupted controllers at startup. Mission reset first cancels active controllers, then clears controller, run, tool, Git, review, artifact, and session state.

## Safety Boundary

The controller remains local by default. It does not read secret paths, run arbitrary shell commands, merge, deploy, force push, delete branches, or run destructive Git reset/checkout commands. Remote branch push and draft PR creation stay behind explicit Git-runner and guarded automation policy gates; when evidence or policy is missing, the controller records a skipped handoff instead of mutating the remote.
