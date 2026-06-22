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
- Persist mission command, title, assumptions, risks, autonomy mode, and timestamps through the orchestrator.
- Keep local recovery when the orchestrator is unavailable.
- Make seeded data clearly secondary to real mission state.

### H2: Mission History And Run Recovery

- Add a mission history backed by persisted orchestrator state.
- Reopen previous controller, tool, Git, review, CI, and delivery evidence.
- Do not replay commits, pushes, PR creation, or destructive actions during recovery.

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
- Current implementation target: continue H1 by persisting assumptions as first-class intake data, then move into H2 mission history and run recovery.
