# Autonomous Mission Controller

Phase 6 adds a persisted local controller that advances one mission through the existing policy boundaries.

## Stage Flow

```txt
planning
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
The final handoff policy stage evaluates guarded automation decisions for remote handoff and deployment readiness without executing push, PR creation, merge, deploy, force-push, branch deletion, destructive Git, secret serialization, fine-tuning, or unbounded loop actions.

## Lifecycle

- `queued`: persisted and waiting for execution.
- `running`: executing one bounded stage.
- `completed`: every local stage passed, a delivery report exists, and handoff automation policy was evaluated.
- `blocked`: a policy, evidence, CI, or reviewer gate stopped the mission.
- `failed`: an unexpected internal error stopped execution.
- `cancelled`: the user requested cancellation.

Every stage records attempt number, summary, timestamps, and concrete evidence IDs. Controllers have two attempts by default. Interrupted queued or running records resume when the orchestrator restarts.

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

The controller remains local by default. It does not push branches, create remote pull requests, merge, deploy, read secret paths, or run destructive Git reset/checkout commands. The handoff policy stage records eligibility and blockers only.
