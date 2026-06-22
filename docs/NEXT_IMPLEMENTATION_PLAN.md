# Next Implementation Plan: Phase 8 Real Mission Execution

Status: Phase 8 H1 in progress after Phase 7 draft PR publication on 2026-06-22

## 1. Current Position

Phase 7 GitHub Repository Integration is complete through draft PR publication.

- Repository: `phetjaaeiei/AI-Agent`
- Branch: `codex/phase-7-remote-mutation-policy`
- Draft PR: `https://github.com/phetjaaeiei/AI-Agent/pull/1`
- PR state: open draft
- Merge state: clean

The app can now run local-first agent planning, local tool evidence, Git evidence, review packets, local CI, independent reviewer decisions, delivery Markdown, guarded remote branch publication, draft PR creation, and read-only remote publication evidence.

## 2. Phase 8 Goal

Turn the current Mission Control prototype into a practical end-to-end local mission workspace where a user can enter a real mission, watch the controller advance it, inspect real evidence, and recover previous mission runs without relying on static demo state.

```txt
user mission
  -> persisted mission session
  -> controller run
  -> real tool/git/review/CI evidence
  -> delivery packet
  -> optional draft PR handoff
```

## 3. Operating Rules

- Use local Ollama by default for live agent execution.
- Keep deterministic fallback visible and testable.
- Keep arbitrary shell, secret reads, deploy, production actions, force push, branch deletion, destructive Git reset/checkout, automatic merge, and automatic public release out of scope.
- Keep GitHub behavior draft-PR and remote-evidence oriented until a human explicitly decides merge/release policy.
- Preserve all durable project memory in the AI-Agent Obsidian vault after substantive work.

## 4. Delivery Slices

### Slice H1: Mission Intake And Session Source Of Truth

- current progress: runtime snapshots now include a durable `missionState` lifecycle (`draft`, `saved`, `running`, `blocked`, `delivered`) shared by the web app and orchestrator services;
- current progress: Mission Control now has an inline mission intake panel with dynamic title/command parsing, Save mission, Reset draft, server sync, and local fallback;
- current progress: mission assumptions now persist as first-class `AssumptionRecord` data with a recoverable draft, backward-compatible snapshot restore, server sync, local fallback, and real inspector rendering;
- replace remaining static/demo mission defaults with real persisted mission/run history;
- persist mission title, command, assumptions, risks, selected autonomy mode, and created timestamp through the orchestrator;
- keep local recovery if the orchestrator is unavailable;
- show clear empty, draft, saved, running, blocked, and delivered mission states.

### Slice H2: Mission History And Run Recovery

- next implementation target;
- add a mission/run list backed by persisted orchestrator state;
- let users reopen a mission controller run, review packet, tool evidence, Git operation, and delivery packet;
- distinguish current run, previous runs, cancelled runs, blocked runs, and delivered runs;
- avoid replaying remote mutation or local commits during recovery.

### Slice H3: Real Evidence Inspector

- make Artifact Memory and inspector panels prioritize real orchestrator artifacts over seeded demo artifacts;
- add better filters for tool, Git, review, agent, and delivery evidence;
- expose command output summaries without leaking denied paths or secrets;
- keep artifact Markdown readable on desktop and mobile.

### Slice H4: End-To-End Mission QA

- add deterministic verification for a user-entered mission moving through controller, tool evidence, Git evidence, review, CI, reviewers, and delivery;
- add rendered QA for new mission intake, blocked mission, recovered mission, and delivered mission states;
- keep Browser-first QA when available and Playwright fallback when `iab` is unavailable.

### Slice H5: Phase 8 Hardening

- improve errors for Ollama unavailable, GitHub auth unavailable, CI failure, denied path changes, and stale remote branch state;
- add explicit retry guidance that does not repeat commits, pushes, or PR creation;
- document remaining human handoff steps.

## 5. Not In This Phase

- automatic merge;
- deployment or production release;
- force push;
- branch deletion;
- destructive Git reset/checkout;
- cloud model requirement;
- secret serialization;
- unbounded autonomous loops.

## 6. Required Verification

- `npm run typecheck`;
- `npm run verify:foundation`;
- `npm run verify:agent-runtime`;
- `npm run verify:tool-runner`;
- `npm run verify:git-runner`;
- `npm run verify:review-packet`;
- `npm run verify:mission-controller`;
- `npm run verify:orchestrator`;
- `npm run build:web`;
- rendered QA for desktop and mobile mission intake/recovery/delivery flows.
