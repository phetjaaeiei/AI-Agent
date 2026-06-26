# Next Implementation Plan: Phase 11 Implementation Surface Hydration

Status: Phase 11 complete through P11.1 allowlisted surface module hydration

## 1. Current Position

Phase 8 Real Mission Execution, Phase 9 Guarded Automation, and Phase 10 Implementation Patch Loop are complete. Phase 11 now connects the generated implementation surface modules back into Mission Control so the preview can render from the same allowlisted module path that the controller wrote as patch evidence.

- Repository: `phetjaaeiei/AI-Agent`
- Branch: `codex/phase-7-remote-mutation-policy`
- Draft PR: `https://github.com/phetjaaeiei/AI-Agent/pull/1`
- PR state: open draft
- Merge state: clean

The app can now run local-first agent planning, policy-controlled targeted local implementation patches, rendered implementation preview, allowlisted surface module hydration, local tool evidence, Git evidence, review packets, local CI, independent reviewer decisions, delivery Markdown, guarded remote branch publication policy checks, draft PR policy checks, read-only remote publication evidence, reviewed draft-PR evidence hydration, and read-only recovery of previous mission runs.

The next target is not "let the agent rewrite anything." The target is a visible, bounded implementation loop:

```txt
mission command
  -> planning
  -> bounded implementation patch
  -> Git diff evidence
  -> review packet
  -> CI evidence
  -> reviewer decisions
  -> delivery report
  -> guarded handoff policy
```

## 2. Phase 11 Goal

Make generated implementation surface modules a first-class preview source without loosening write policy:

```txt
implementation patch artifact
  -> target path
  -> allowlisted generated surface module
  -> Mission Control rendered preview
  -> recovery preview
```

The phase should keep the current safety model:

- generated modules are imported through a small frontend utility;
- the card selects a module only by exact allowlisted target path;
- patch artifact fallback remains available;
- no arbitrary dynamic import or workspace file read is added to the browser.

## 3. Phase 11 Delivery Slices

### Slice P11.1: Surface Module Hydration

- complete: added a frontend `implementation-surfaces` utility that imports the three allowlisted generated surface modules and resolves them by target path;
- complete: `ImplementationPreviewCard` accepts optional surface modules and uses the matching module when a `Local Code Patch` artifact points to an implementation surface target;
- complete: live Mission Control and recovered mission inspectors pass the same surface module registry into the preview card;
- complete: rendered QA now asserts generated preview output comes from the dashboard surface module path instead of the generic artifact fallback;
- complete: no remote, shell, Git, deploy, merge, or dynamic browser file-read behavior was added.

### Slice P11.2: Surface Module Contract Hardening

- pending: move repeated generated surface module types into a shared frontend type helper if the generated module format grows;
- pending: add focused parser or contract checks for surface module target selection without relying only on rendered QA;
- pending: consider surfacing the module source label in Mission Control if it helps users distinguish manifest, surface module, and archived patch fallbacks.

## 4. Operating Rules

- Use local Ollama by default for live agent execution.
- Keep deterministic fallback visible and testable.
- Keep arbitrary shell, secret reads, force push, branch deletion, destructive Git reset/checkout, secret serialization, silent fine-tuning, and unbounded autonomous loops hard-disabled.
- Keep merge and production deploy manual-only until a dedicated connector policy, approval model, rollback/canary behavior, and audit trail exist.
- Keep implementation writes routed through explicit local policy and visible patch artifacts.
- Preserve all durable project memory in the AI-Agent Obsidian vault after substantive work.

## 5. Phase 10 Completed Baseline

Turn mission commands into local, reviewable code patches without bypassing the existing tool-runner, Git-runner, review, CI, delivery, or automation-policy layers:

```txt
implementation request
  -> local patch policy
  -> generated patch artifact
  -> rendered preview and test evidence
  -> reviewer and delivery gates
  -> manual or guarded remote handoff
```

## 6. Phase 10 Delivery Slices

### Slice P10.1: Bounded Implementation Patch Stage

- complete: added `implementation_patch` to the shared controller stage contract and stop-code contract;
- complete: controller now writes a bounded generated preview module through `ToolCallService` and `file_write` before local evidence collection;
- complete: file-write failures stop the controller with `implementation_failed` and linked evidence;
- complete: Mission Control shows an `Implementation Preview` card backed by the generated module or the latest `Local Code Patch` artifact;
- complete: live and recovery inspector stage lists include `implementation_patch`;
- complete: deterministic and rendered verification assert completed file-write evidence and generated UI state.

### Slice P10.2: Rendered Preview Pipeline

- complete: generated implementation preview modules now include a typed rendered `surface` model with landing, dashboard, and workflow variants;
- complete: Mission Control renders a preview canvas inside the `Implementation Preview` card from either seed/generated data or the latest `Local Code Patch` artifact;
- complete: recovered mission archives render the same preview canvas from archived patch artifacts without replaying the controller write;
- complete: deterministic verification asserts generated surface types and dashboard/workflow variants;
- complete: rendered QA asserts waiting, generated, and recovered implementation preview surfaces on desktop and mobile.

### Slice P10.3: Targeted Patch Expansion

- complete: added shared `phase10-targeted-patch-v1` implementation patch policy with exact target allowlist, owner-role hints, TypeScript-only extension limits, denied path fragments, byte limits, and two-target controller cap;
- complete: controller preflights implementation targets against the shared policy before any `file_write`;
- complete: controller now writes both the preview manifest and one allowlisted surface module (`landing`, `dashboard`, or `workflow`) selected from the mission command;
- complete: deterministic verification asserts policy allow/deny behavior, two file-write artifacts, generated surface module output, and recovered history counts;
- complete: rendered QA asserts the implementation preview still renders from the latest targeted patch artifact in live and recovered views.

### Slice P10.4: Human Approval And Remote Handoff Link

- complete: Git remote mutation policy now explicitly requires delivered review evidence, passing local CI, required reviewer approvals, delivery artifact content, implementation preview manifest evidence, and implementation surface module evidence before branch push or draft PR creation can execute;
- complete: `GitOperationService` receives the tool-call store so it can resolve implementation `file_write` evidence by target path and artifact id instead of relying only on delivery Markdown;
- complete: draft PR body hydration now includes delivery Markdown plus implementation patch targets, rendered preview target evidence, CI command results, reviewer decisions, delivery artifact ids, and remote safety notes;
- complete: automatic merge and production deployment remain manual-only, with force push, branch deletion, destructive Git, and deploy actions still disabled by the guarded automation policy.

## 7. Phase 9 Completed Baseline

Phase 9 is complete. The shipped baseline includes:

- guarded automation policy contracts, evaluator, and read-only API;
- Mission Control automation policy matrix and missing-evidence display;
- controller handoff policy decisions persisted on controller records;
- read-only remote evidence, branch-push policy evidence, and draft-PR policy evidence;
- bounded remote handoff execution gate through Git-specific operations when policy/evidence explicitly allow it;
- Remote Handoff Execution card and compact top-level Handoff signal;
- default skipped handoff, policy-enabled completed handoff, blocked handoff, and failed handoff rendered QA fixtures;
- continued hard-disable/manual-only boundaries for merge, production deploy, force push, branch deletion, destructive Git, secret serialization, silent fine-tuning, and unbounded loops.

## 8. Phase 8 Completed Slices

### Slice H1: Mission Intake And Session Source Of Truth

- complete: runtime snapshots include a durable `missionState` lifecycle (`draft`, `saved`, `running`, `blocked`, `delivered`) shared by the web app and orchestrator services;
- complete: Mission Control has inline command and assumption intake, Save mission, Reset draft, server sync, and local fallback;
- complete: mission title, command, assumptions, risks, autonomy mode, and timestamps persist through the orchestrator.

### Slice H2: Mission History And Run Recovery

- complete: added a create-once mission history archive backed by `.data/mission-history.json`;
- complete: controller terminal states, pre-retry attempts, and reset capture immutable evidence snapshots;
- complete: `GET /api/mission/history` and `GET /api/mission/history/:historyId` expose current and archived runs without mutation endpoints;
- complete: Mission Control distinguishes current, cancelled, blocked, failed, and delivered runs;
- complete: the read-only recovery inspector reopens controller, agent, tool, Git, review, CI, artifact, and delivery evidence without replaying any action.

### Slice H3: Real Evidence Inspector

- complete: Artifact Memory and inspector panels prioritize non-seeded evidence before seeded demo artifacts;
- complete: Mission Control has evidence source and status filters for agent, tool, Git, review, server, and local evidence;
- complete: Artifact Memory exposes readable Markdown reports in a collapsible inspector block;
- complete: safety-oriented Ollama auto learning queue auto-captures evidence as local learning candidates while model mutation and fine-tuning remain disabled until a dedicated policy exists;
- complete: command output summaries expose clipped tool/Git command evidence with workspace-root, denied-path, API-key, bearer-token, and secret-like value redaction before display.

### Slice H4: End-To-End Mission QA

- complete: added deterministic HTTP verification for a user-entered mission moving through controller, tool evidence, Git evidence, review packet, local CI, reviewers, delivery, history recovery, and reset retention;
- complete: added rendered Playwright QA for new mission intake, blocked mission, recovered mission, and delivered mission states across desktop and mobile;
- complete: Browser-first QA was attempted, but the in-app Browser returned `Browser is not available: iab`; Playwright fallback was used and recorded.

### Slice H5: Phase 8 Hardening

- complete: added inline hardening guidance for Ollama unavailable, GitHub auth unavailable, CI failure, denied path changes, stale remote branch state, blocked mutation policy, delivered handoff, and retry boundaries;
- complete: retry guidance states that controller/planner/remote-evidence retries do not repeat commits, pushes, PR creation, merge, or deployment actions;
- complete: documented remaining human handoff steps in [PHASE_8_HARDENING_AND_HANDOFF.md](./PHASE_8_HARDENING_AND_HANDOFF.md);
- complete: final H5 verification sweep passed.

### Post-H5 UI Concept Refresh

- complete: refreshed Mission Control toward the Pixel War Room concept with a tactical live signal band for runtime, controller, evidence, and handoff readiness;
- complete: separated stable frontend pieces into `components/layout`, `components/primitives`, `components/concept`, and `styles`;
- complete: continued component extraction into `components/mission` and reusable `utils` for mission labels and time formatting;
- complete: continued extraction by moving the read-only mission recovery inspector into `components/mission` and shared role/Git/tool labels into reusable `utils`;
- complete: continued extraction by moving the mission summary/activity feed bottom dock into `components/mission` while preserving local-agent run and activity-filter behavior;
- complete: continued extraction by moving Task Graph and Artifact Memory cards into `components/mission` and artifact source/seed helpers into reusable `utils`;
- complete: continued extraction by moving Evidence Inspector, Command Output, and Ollama Auto Learning cards into `components/mission` while preserving filter, redaction summary, and learning-candidate behavior;
- complete: kept UI state tied to live runtime, evidence, and Git/review policy rather than introducing static showcase-only content;
- complete: rendered desktop/mobile QA and Phase 8 verification sweeps passed after the folder organization.

## 9. Still Not Automatic

- automatic merge;
- production release;
- force push;
- branch deletion;
- destructive Git reset/checkout;
- cloud model requirement;
- secret serialization;
- silent fine-tuning or model mutation without a visible local policy;
- unbounded autonomous loops.

## 10. Required Verification

- `npm run verify:automation-policy`;
- `npm run typecheck`;
- `npm run verify:foundation`;
- `npm run verify:agent-runtime`;
- `npm run verify:tool-runner`;
- `npm run verify:git-runner`;
- `npm run verify:review-packet`;
- `npm run verify:mission-controller`;
- `npm run verify:phase8-e2e`;
- `npm run verify:phase8-rendered`;
- `npm run verify:orchestrator`;
- `npm run build:web`;
- rendered QA for desktop and mobile mission intake/recovery/delivery flows.

## 11. Next

- Continue Phase 11 with P11.2 surface module contract hardening.
- Keep implementation writes routed through explicit local policy and visible patch artifacts.
- Keep merge, production actions, force push, branch deletion, destructive Git reset/checkout, secret serialization, silent fine-tuning, and unbounded autonomous loops out of controller auto-execution.
