# Guarded Automation Policy

Date: 2026-06-26

## Purpose

Phase 9 starts by turning the previously manual safety list into a shared automation policy that code, API checks, Mission Control, and future controllers can evaluate deterministically.

The first slice does not execute merge, deployment, force push, branch deletion, destructive reset/checkout, secret serialization, fine-tuning, or unbounded loops. It only defines the policy matrix and exposes the active snapshot for inspection.

## Policy Modes

- `auto`: the controller may run a bounded automatic action when every required evidence flag is present.
- `review_required`: the action can proceed only after explicit review or approval flow.
- `manual_only`: the action stays a human release or operations decision.
- `disabled`: the action is blocked regardless of evidence.

## Phase 9 V1 Action Matrix

| Action | Default Mode | Auto Eligible | Boundary |
| --- | --- | --- | --- |
| Mission planning | `auto` | Yes | Local, bounded attempts, visible output. |
| Controller retry | `auto` | Yes | Requires bounded retry budget evidence. |
| Tool read | `auto` | Yes | Workspace policy and no secret material. |
| Local file write | `review_required` | Possible later | Requires reviewed delivery and no secret material before automatic use. |
| Test command | `auto` | Yes | Allowlisted local commands only. |
| Git status/diff/commit plan | `auto` | Yes | Read-only, redacted, no denied-path secret material. |
| Local Git commit | `review_required` | No | Still explicit and policy-gated. |
| Remote branch push | `review_required` | Yes, bounded | Requires explicit connector policy, policy switch, reviewed delivery, passing CI, current remote branch evidence, and no secret material. |
| Draft PR creation | `review_required` | Yes, bounded | Same safeguards as remote branch push. |
| Pull request merge | `manual_only` | No | Requires a dedicated merge connector policy before this can change. |
| Staging deploy | `review_required` | Yes, bounded | Requires explicit deployment policy, CI, review, rollback plan, and secret checks. |
| Production deploy | `manual_only` | No | Requires canary/rollback/approval policy before this can change. |
| Force push | `disabled` | No | Hard-disabled. |
| Branch deletion | `disabled` | No | Hard-disabled until audited retention exists. |
| Destructive Git reset/checkout | `disabled` | No | Hard-disabled. |
| Secret serialization | `disabled` | No | Hard-disabled. |
| Silent fine-tuning | `disabled` | No | Hard-disabled. |
| Unbounded autonomous loop | `disabled` | No | Hard-disabled. |

## Runtime Shape

```txt
shared automation contract
  -> createDefaultAutomationPolicySnapshot()
  -> evaluateAutomationAction()
  -> GET /api/mission/automation-policy
  -> mission controller handoff_policy stage
  -> future Mission Control/controller wiring
```

## Endpoint

- `GET /api/mission/automation-policy`

The endpoint returns the active `phase9-guarded-automation-v1` snapshot. It is read-only and does not grant permissions or execute actions.

## Mission Control Surface

Mission Control now shows a read-only Automation Policy card in the mission inspector. The card:

- lists the key guarded actions;
- groups decisions into auto-ready, review, manual, and disabled counts;
- shows the effective mode for each action;
- shows the first missing evidence or blocker for blocked actions;
- keeps merge, production deploy, force push, branch deletion, destructive Git operations, secret serialization, silent fine-tuning, and unbounded loops out of automatic execution.

Mission Control also shows the persisted controller handoff decisions after a completed controller run. The live controller card and read-only recovery inspector both expose the stored `automationDecisions`, so archived runs can explain the exact branch push, draft PR, staging deploy, merge, production deploy, destructive Git, secret, model-mutation, and loop-control outcomes without replaying any action.

Mission Control now also shows remote handoff execution evidence. The live inspector and read-only recovery inspector derive execution state from `automation_handoff_execution_*` audit events plus `branch_push` and `draft_pr_create` Git operations, so users can distinguish waiting, skipped, running, completed, blocked, and failed handoff attempts without replaying actions.

The top War Room signal band also includes a compact `Handoff` signal backed by the same execution evidence. It lets operators see waiting, skipped, running, completed, blocked, or failed handoff state without scrolling into the inspector.

Rendered QA also covers interrupted bounded-auto handoff attempts. Dedicated fixtures prove the live and recovered views for policy-blocked branch push and failed branch push execution, while the dependent draft PR row is shown as skipped because branch publication did not complete.

The surface is intentionally informational. It does not add new mutation buttons.

## Controller Handoff Gate

The mission controller now evaluates guarded handoff automation after delivery:

```txt
delivery report
  -> remote_evidence
  -> branch_push_policy
  -> draft_pr_policy
  -> evaluateAutomationAction()
  -> persisted automationDecisions
```

After the decisions are persisted, the controller has a bounded remote handoff execution gate:

```txt
persisted automationDecisions
  -> canRunAutomatically? for git_branch_push / git_draft_pr_create
  -> GitOperationService branch_push / draft_pr_create
  -> audit execution started / skipped / completed
```

Default runs skip execution because required policy and committed remote evidence are not present. When every policy requirement is present, the controller delegates only to the Git-specific policy layer. It does not bypass Git runner checks.

Phase 10 P10.4 adds an extra reviewed handoff check inside the Git operation service: branch push and draft PR creation must resolve delivered review evidence, passing local CI, required reviewer approvals, delivery artifact content, and implementation patch artifacts for both the generated preview manifest and an allowlisted surface module. Draft PR body hydration includes those evidence references before invoking the GitHub draft-PR command.

This stage records activity and audit events. It still does not execute merge, deployment, force push, branch deletion, destructive Git operations, secret serialization, fine-tuning, or unbounded loops.

## Required Evidence

Automation decisions are evaluated from explicit evidence flags, including:

- `policy_switch_enabled`
- `connector_policy_present`
- `reviewed_delivery`
- `passing_local_ci`
- `reviewer_approval`
- `remote_branch_current`
- `draft_pr_open`
- `rollback_plan`
- `staging_smoke_passed`
- `production_approval`
- `bounded_retry_budget`
- `no_secret_material`

Missing evidence produces machine-readable blockers. Hard-disabled actions remain blocked even when all evidence flags are present.

## Verification

- `npm run verify:automation-policy`
- `npm run verify:mission-controller`
- `npm run verify:phase8-e2e`
- `npm run verify:phase8-rendered`

The verification asserts:

- every action has exactly one policy row;
- hard-disabled actions never become automatic;
- branch push and draft PR creation are only bounded-auto with explicit evidence;
- merge and production deploy remain non-automatic;
- controller retry requires bounded retry budget evidence;
- the orchestrator exposes the read-only automation policy endpoint.
- the controller stores handoff automation decisions after delivery without mutation operations;
- default controller handoff runs audit skipped remote execution when no remote action is eligible;
- a deterministic enabled fixture proves branch push and draft PR creation are called only after policy decisions allow bounded auto;
- the rendered Mission Control UI shows the guarded automation policy card on desktop and mobile intake paths.
- the rendered Mission Control UI shows persisted controller handoff decisions on delivered and recovered mission paths.
- the rendered Mission Control UI shows skipped remote handoff execution evidence on delivered and recovered mission paths.
- the rendered Mission Control QA fixture now also covers completed bounded remote handoff evidence on live delivered and recovered mission paths, using a dedicated policy-enabled Git runner fixture rather than changing the default no-mutation path.
- the rendered Mission Control QA now asserts the top Handoff signal shows waiting before execution, skipped on the default delivered path, and completed on the policy-enabled auto-handoff path.
- the rendered Mission Control QA now asserts blocked and failed remote handoff execution states on live delivered and recovered mission paths.
