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
- Auto-capture real local evidence as Ollama learning candidates without mutating the active model until a dedicated training policy exists.

### H4: End-To-End Mission QA

- `npm run verify:phase8-e2e` now covers a user-entered mission moving through the orchestrator HTTP API, autonomous controller, deterministic planning, bounded tool evidence, real local Git evidence, review packet, default local CI, three reviewer approvals, delivery report, history recovery, and reset retention.
- The deterministic path uses fixture test-command execution but keeps real tool-runner policy evaluation and real local Git evidence on a temporary repository.
- The deterministic path asserts that local commit, remote push, and draft PR creation do not occur.
- `npm run verify:phase8-rendered` now covers rendered mission intake, delivered mission, recovered mission, and blocked mission states at desktop and mobile viewport sizes.
- Browser-first QA was attempted, but the in-app Browser returned `Browser is not available: iab`; Playwright fallback is the recorded H4 path.

### H5: Hardening

- Mission Control now shows inline hardening guidance for Ollama unavailable, GitHub auth unavailable, CI failure, denied path changes, stale remote evidence, blocked remote policy, delivered handoff, and retry boundaries.
- Retry guidance states that controller, planner, and remote-evidence retries do not repeat commits, pushes, PR creation, merge, or deployment actions.
- Human handoff steps are documented in [PHASE_8_HARDENING_AND_HANDOFF.md](./PHASE_8_HARDENING_AND_HANDOFF.md).
- Final H5 verification passed.

## Safety Boundaries

- No automatic merge.
- No deployment or production action.
- No force push.
- No branch deletion.
- No destructive Git reset/checkout.
- No secret serialization.
- No arbitrary shell outside the tool-runner policy.
- No silent Ollama fine-tuning, model replacement, or adapter creation without an explicit local training policy.

## Current Handoff

- Phase 7 draft PR: `https://github.com/phetjaaeiei/AI-Agent/pull/1`
- Current branch: `codex/phase-7-remote-mutation-policy`
- Current implementation target: Phase 8 is complete through H5 hardening.
