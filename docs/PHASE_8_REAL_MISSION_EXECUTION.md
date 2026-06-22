# Phase 8 Real Mission Execution

Date: 2026-06-22

## Purpose

Phase 8 makes Team AI Agent useful for repeatable, real local missions instead of mostly seeded demonstration state. The phase keeps the existing safety model: local-first execution, deterministic fallback, policy-controlled tools, policy-controlled Git, review evidence, and human-controlled remote handoff.

## User Outcome

A user should be able to:

1. Enter a mission.
2. Save it as a durable mission session.
3. Run the autonomous controller.
4. Inspect real tool, Git, review, CI, reviewer, and delivery evidence.
5. Reopen previous runs.
6. Hand off via draft PR when policy allows.

## Delivery Slices

### H1: Mission Intake And Session Source Of Truth

- Runtime session snapshots now carry a durable `missionState` object with lifecycle status, title, source, reason, created timestamp, and updated timestamp.
- Command edits in Mission Control update the parsed mission plan and mark the mission as a local draft.
- The orchestrator, agent runtime, review delivery, and mission controller update mission lifecycle state when they advance, block, or deliver a mission.
- Mission Control now includes an inline mission intake panel with dynamic title, command, parsed capability/risk/setup chips, Save mission, Reset draft, server sync, and local fallback.
- The HUD and HQ panel title now use the persisted mission title instead of the static benchmark title.
- Mission assumptions now persist as first-class `AssumptionRecord` data with a recoverable line-based draft.
- Mission Intake saves and resets command plus assumptions together, while the inspector renders the saved assumption log instead of a static fixture.
- Old runtime snapshots without assumption fields restore with an empty assumption log.
- Mission command, title, assumptions, risks, autonomy mode, and timestamps persist through the orchestrator.
- Keep local recovery when the orchestrator is unavailable.
- Make seeded data clearly secondary to real mission state.

### H2: Mission History And Run Recovery

- Mission history contracts now preserve session, controller, agent run/events, tool, Git, review, artifact, CI, and delivery evidence.
- A create-once file-backed archive captures terminal controller states, previous retry attempts, and the current session before reset.
- `GET /api/mission/history` lists the current run plus archived runs; `GET /api/mission/history/:historyId` opens one full evidence snapshot.
- Mission Control renders a compact run history strip and a read-only recovery inspector for delivered, blocked, failed, and cancelled runs.
- Recovery uses GET requests only and exposes no controller, agent, tool, Git, review, commit, push, or PR action controls.
- See [MISSION_HISTORY_AND_RECOVERY.md](./MISSION_HISTORY_AND_RECOVERY.md).

### H3: Real Evidence Inspector

- Prioritize real artifacts over seeded artifacts in Artifact Memory.
- Add filters for evidence source and status.
- Keep Markdown reports readable in dense inspector panels.

### H4: End-To-End Mission QA

- Add deterministic tests for full mission progression.
- Add rendered QA for mission intake, blocked state, recovery, and delivered state.
- Use Browser plugin first when available; use Playwright fallback when unavailable.

### H5: Hardening

- Improve user-facing errors for Ollama, GitHub auth, CI, denied paths, and stale remote state.
- Add retry guidance that avoids duplicate commits, pushes, or PR creation.
- Update runbooks and Obsidian memory after substantive work.

## Safety Boundaries

- No automatic merge.
- No deployment or production action.
- No force push.
- No branch deletion.
- No destructive Git reset/checkout.
- No secret serialization.
- No arbitrary shell outside the tool-runner policy.

## Current Handoff

- Phase 7 draft PR: `https://github.com/phetjaaeiei/AI-Agent/pull/1`
- Current branch: `codex/phase-7-remote-mutation-policy`
- Current implementation target: start H3 Real Evidence Inspector.
