# Phase 10 Implementation Patch Loop

Date: 2026-06-26

## Purpose

Phase 10 turns the autonomous controller from an evidence collector into a local implementation loop. The controller can now create a bounded local code patch before Git evidence, review packets, CI evidence, reviewer decisions, delivery reports, and guarded handoff policy run.

## Completed Slices

### P10.1: Bounded Implementation Patch Stage

P10.1 is intentionally narrow:

- stage: `implementation_patch`;
- writer: `ToolCallService` using the local tool-runner `file_write` policy;
- target: `apps/web/src/generated/mission-implementation-preview.ts`;
- artifact: `Local Code Patch` from `tool_runner`;
- UI: `Implementation Preview` card in Mission Control;
- recovery: live and archived controller views show the `implementation_patch` stage.

For a command such as "create a landing page for this web app", the current controller writes generated landing-page preview content into the generated module. Mission Control then displays that patch as implementation evidence. It does not yet rewrite arbitrary application routes or components.

### P10.2: Rendered Preview Pipeline

P10.2 makes the generated patch visible as a rendered preview:

- generated preview modules include `MissionImplementationPreviewSurface`;
- the controller chooses landing, dashboard, or workflow preview variants from the mission command;
- Mission Control renders a preview canvas from generated module data before a mission and from `Local Code Patch` artifact data after a mission;
- recovered mission archives render the same preview canvas from archived artifact contents without replaying controller work;
- rendered QA asserts waiting, generated, and recovered preview surfaces on desktop and mobile.

### P10.3: Targeted Patch Expansion

P10.3 expands implementation generation beyond the single manifest while keeping a tight policy boundary:

- policy version: `phase10-targeted-patch-v1`;
- max targets per controller run: 2;
- allowed target 1: `apps/web/src/generated/mission-implementation-preview.ts`;
- allowed target 2: one selected surface module under `apps/web/src/generated/implementation-surfaces/`;
- surface variants: `landing`, `dashboard`, `workflow`;
- file type: TypeScript only;
- owner role hint: `frontend_developer`;
- denied fragments include secret paths, Git internals, local data, dependency folders, build output, coverage output, and private-key patterns.

The controller preflights every implementation target through this policy before calling tool-runner `file_write`. The generic local tool runner remains unchanged and still performs workspace-root, denied-path, size, and execution policy checks.

## Safety Boundary

The patch stage inherits the Phase 3 local tool-runner boundary:

- workspace-root confinement;
- denied `.env`, `.git`, `.data`, `node_modules`, `dist`, generated build folders, coverage, and private-key paths;
- no arbitrary shell;
- no remote Git through the tool runner;
- no merge, production deploy, force push, branch deletion, destructive Git reset/checkout, secret serialization, silent fine-tuning, or unbounded loops.

If the write is blocked or fails, the controller stops at `implementation_patch` with `implementation_failed` and links the failed tool-call evidence.

## Verification Coverage

P10.1 verification covers:

- shared controller stage typing;
- successful `file_write` and patch artifact generation;
- E2E mission run expecting implementation patch before CI commands;
- rendered waiting state before mission run;
- rendered generated state after mission delivery;
- desktop and mobile rendered QA.

The full sweep passed on 2026-06-26:

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
- `git diff --check`.

P10.2 reused the same full sweep on 2026-06-26 and added focused assertions for generated surface types, dashboard/workflow variants, desktop/mobile rendered preview canvas states, and recovered preview surfaces.

P10.3 reused the same full sweep on 2026-06-26 and added focused assertions for implementation patch policy allow/deny behavior, two-target controller writes, generated dashboard/workflow surface modules, recovered history counts, and rendered preview recovery from the latest targeted patch artifact.

P10.4 links implementation patch evidence to guarded remote handoff:

- remote branch push and draft PR creation now require delivered review evidence, passing local CI, required reviewer approvals, delivery artifact content, preview manifest patch evidence, and generated surface module patch evidence;
- draft PR body hydration includes delivery Markdown, implementation target paths/artifact ids, rendered preview references, CI command results, reviewer decisions, delivery ids, and remote safety notes;
- automatic merge, production deployment, force push, branch deletion, destructive Git, and deploy actions remain outside automation.

P10.4 reused the same full sweep on 2026-06-26 and added focused assertions for implementation evidence requirements, hydrated draft PR content, committed remote mutation fixtures, and rendered handoff compatibility.

## Next Slices

- Define the next phase for broader implementation patch generation while preserving the Phase 10 policy, review, CI, delivery, and remote handoff boundaries.
