# Next Implementation Plan: Phase 9 Guarded Automation

Status: Phase 9 complete through blocked/failed remote handoff rendered QA coverage

## 1. Current Position

Phase 8 Real Mission Execution is complete through H5 hardening, post-H5 UI concept refresh, mission card extraction, and sidebar layout hardening.

- Repository: `phetjaaeiei/AI-Agent`
- Branch: `codex/phase-7-remote-mutation-policy`
- Draft PR: `https://github.com/phetjaaeiei/AI-Agent/pull/1`
- PR state: open draft
- Merge state: clean

The app can now run local-first agent planning, local tool evidence, Git evidence, review packets, local CI, independent reviewer decisions, delivery Markdown, guarded remote branch publication, draft PR creation, read-only remote publication evidence, and read-only recovery of previous mission runs.

The next implementation target is not "make every dangerous action automatic." The target is to add a shared automation policy that decides which actions can become bounded-auto, which actions require explicit review, which actions remain manual-only, and which actions stay hard-disabled.

## 2. Phase 9 Goal

Turn the current safety handoff list into policy-driven automation gates:

```txt
action request
  -> shared automation policy
  -> required evidence check
  -> bounded auto / review required / manual only / disabled
  -> visible Mission Control decision
```

## 3. Operating Rules

- Use local Ollama by default for live agent execution.
- Keep deterministic fallback visible and testable.
- Keep arbitrary shell, secret reads, force push, branch deletion, destructive Git reset/checkout, secret serialization, silent fine-tuning, and unbounded autonomous loops hard-disabled.
- Keep merge and production deploy manual-only until a dedicated connector policy, approval model, rollback/canary behavior, and audit trail exist.
- Allow staging deploy, remote branch push, and draft PR creation to become bounded-auto only after explicit connector policy and required evidence are present.
- Keep GitHub behavior draft-PR and remote-evidence oriented until merge/release policy exists.
- Preserve all durable project memory in the AI-Agent Obsidian vault after substantive work.

## 4. Delivery Slices

### Slice P9.1: Guarded Automation Policy Foundation

- complete: added shared automation action kinds, modes, evidence requirements, policy snapshot, and evaluator;
- complete: exposed `GET /api/mission/automation-policy` as a read-only policy endpoint;
- complete: added deterministic verification that hard-disabled actions never become automatic and that auto-eligible actions require explicit evidence;
- complete: surfaced automation decisions in Mission Control;
- complete: wired controller decisions through the automation policy before any future automatic remote or deploy action.

### Slice P9.2: Mission Control Automation Surface

- complete: Mission Control shows the active automation policy matrix in the inspector;
- complete: Mission Control shows why each tracked action is auto, review-required, manual-only, or disabled;
- complete: Mission Control exposes missing evidence and hard blockers without mutating state;
- complete: action buttons remain tied to their existing Git/review/deploy policies.

### Slice P9.3: Bounded Auto Handoff Actions

- complete: controller evaluates auto branch push and draft PR creation only after reviewed delivery, passing CI, current remote evidence, explicit connector policy, and no-secret checks;
- complete: controller records audit and activity events before and after the handoff policy preflight;
- complete: controller stores automation decisions on the controller record for recovery and API inspection;
- complete: controller collects read-only `remote_evidence`, `branch_push_policy`, and `draft_pr_policy` Git evidence after delivery;
- complete: Mission Control and the read-only recovery inspector show persisted controller handoff decisions, including branch push, draft PR, manual release actions, and hard-disabled actions;
- keep local commit, merge, production deploy, force push, branch deletion, destructive Git operations, secret serialization, silent fine-tuning, and unbounded loops out of controller auto-execution.

### Slice P9.4: Bounded Remote Handoff Execution Gate

- complete: controller attempts remote branch push and draft PR creation only when the persisted automation decision is `canRunAutomatically`;
- complete: default controller runs audit `automation_handoff_execution_skipped` and do not create branch push or draft PR operations when evidence or policy is missing;
- complete: enabled verification fixture proves the controller can call the Git-specific `branch_push` and `draft_pr_create` operations after policy/evidence pass;
- complete: execution remains Git-runner policy-gated, bounded, audited, and separate from merge/deploy/release actions;
- keep merge, production deploy, force push, branch deletion, destructive Git operations, secret serialization, silent fine-tuning, and unbounded loops out of controller auto-execution.

### Slice P9.5: Remote Handoff Execution Evidence UI

- complete: Mission Control shows a `Remote Handoff Execution` card backed by audit events and Git operations;
- complete: live and recovered mission views distinguish waiting, skipped, running, completed, blocked, and failed handoff execution states;
- complete: default delivered and recovered paths visibly show skipped branch push and draft PR execution;
- complete: rendered QA asserts skipped execution, branch push row, draft PR row, and row count on desktop/mobile delivered and recovery paths;
- keep the surface read-only. No new mutation button was added.

### Slice P9.6: Completed Remote Handoff Rendered QA Fixture

- complete: rendered QA now includes a separate `auto-handoff` orchestrator stack with a policy-enabled Git runner fixture;
- complete: the fixture runs the existing controller and GitOperationService path through completed `branch_push` and `draft_pr_create` operations;
- complete: delivered desktop/mobile UI asserts the Remote Handoff Execution card shows completed branch push and completed draft PR evidence;
- complete: recovered desktop/mobile UI asserts the archived mission shows the same completed remote handoff evidence without replaying any action;
- complete: default complete-path QA still asserts skipped remote execution when required policy/evidence is absent;
- keep merge, production deploy, force push, branch deletion, destructive Git operations, secret serialization, silent fine-tuning, and unbounded loops outside rendered auto fixtures and production auto-execution.

### Slice P9.7: Compact Remote Handoff Signal

- complete: extracted reusable remote handoff execution status helpers for both the inspector card and top War Room signal band;
- complete: the top `Handoff` signal now reflects actual handoff execution evidence as waiting, skipped, running, completed, blocked, or failed;
- complete: rendered QA asserts the Handoff signal shows waiting before execution, skipped on the default delivered path, and completed on the policy-enabled auto-handoff fixture;
- complete: the signal remains read-only and adds no mutation controls.

### Slice P9.8: Blocked/Failed Remote Handoff Rendered QA Fixtures

- complete: rendered QA now includes policy-enabled `blocked-handoff` and `failed-handoff` orchestrator stacks;
- complete: the blocked fixture proves Mission Control renders a bounded-auto branch push that is policy-blocked by the Git runner layer;
- complete: the failed fixture proves Mission Control renders a bounded-auto branch push that fails after policy preflight;
- complete: live delivered and read-only recovered mission views show blocked/failed status, branch push evidence, skipped draft PR evidence, and the top `Handoff` signal state;
- complete: missing draft PR execution after an interrupted branch push now displays as skipped instead of waiting;
- keep merge, production deploy, force push, branch deletion, destructive Git operations, secret serialization, silent fine-tuning, and unbounded loops out of rendered fixtures and production auto-execution.

## 5. Phase 8 Completed Slices

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

## 6. Still Not Automatic

- automatic merge;
- production release;
- force push;
- branch deletion;
- destructive Git reset/checkout;
- cloud model requirement;
- secret serialization;
- silent fine-tuning or model mutation without a visible local policy;
- unbounded autonomous loops.

## 7. Required Verification

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

## 8. Next

- Decide whether Phase 10 should define connector-specific approval policy for staging deploy, or continue hardening local-first mission execution evidence.
- Keep merge, production actions, force push, branch deletion, destructive Git reset/checkout, secret serialization, silent fine-tuning, and unbounded autonomous loops out of controller auto-execution.
