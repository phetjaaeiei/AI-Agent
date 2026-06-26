# Phase 8 Hardening And Handoff

Date: 2026-06-23

## Purpose

Phase 8 H5 makes local mission failures easier to recover from without loosening the safety model. Mission Control now turns known runtime, Git, CI, review, and remote states into visible hardening guidance.

## User-Facing Guidance

Mission Control shows inline guidance in the relevant inspector card:

- Local Agent Runtime explains when Ollama is unavailable and how deterministic fallback is being used.
- Mission Controller explains why a stage stopped and what a bounded retry will repeat.
- Git Integration explains denied path changes, disabled Git read policy, GitHub auth gaps, stale remote evidence, blocked mutation policy, and blocked mutation attempts.
- Review Packet explains CI failures, denied path review blockers, generic blocked requirements, and human handoff readiness.

The guidance is display-only. It does not change policy, grant permissions, retry automatically, or mutate Git state.

## Recovery Rules

### Ollama Unavailable

- Start Ollama locally and ensure the configured model is pulled.
- Deterministic fallback remains visible and testable.
- No cloud model is required by default.

### CI Failure

- Open the Review Packet CI matrix.
- Fix the failing command evidence.
- Rerun local CI.
- Refresh the review packet.
- Rebuild delivery only after requirements pass.

### Denied Path Changes

- Remove or move changes in denied paths such as `.env`, `.git`, `.data`, build output, dependency folders, coverage, and private key material.
- The app must not read, diff, commit, push, serialize, or display raw denied-path content.
- Recheck Git status and rebuild the commit plan after cleanup.

### GitHub Auth Unavailable

- Authenticate outside the app, for example with GitHub CLI.
- Run read-only remote health again.
- Remote push and draft PR creation still require explicit policy, delivered review evidence, and human intent.

### Stale Remote State

- Recheck remote evidence after the branch or draft PR changes.
- Do not repeat branch push or draft PR creation until policy checks pass again.
- Merge, release, deployment, force push, and branch deletion remain out of scope.

## Retry Boundaries

Controller retry:

- archives the previous attempt before mutating the active controller;
- repeats bounded local controller stages;
- does not repeat local commits, branch pushes, draft PR creation, merge, deployment, force push, or branch deletion.

Planner retry:

- repeats planner and verifier work only;
- does not run local tools;
- does not perform Git or remote actions.

Remote evidence retry:

- repeats read-only remote checks;
- does not push a branch;
- does not create or update a pull request.

## Human Handoff Steps

When a mission is delivered:

1. Open the delivery report in Artifact Memory or recovered mission history.
2. Review changed files, verification, risks, rollback notes, and reviewer approvals.
3. Run Git Integration policy checks with the delivered review packet.
4. If branch push policy passes and `TEAM_AI_AGENT_ALLOW_GIT_PUSH=true`, a human may choose `Push branch`.
5. If draft PR policy passes and `TEAM_AI_AGENT_ALLOW_PR_CREATE=true`, a human may choose `Create draft PR`.
6. Review the draft PR in GitHub.
7. Merge, release, deployment, production actions, force push, and branch deletion remain manual and outside Phase 8 automation.

## Verification

- `npm run verify:phase8-rendered` verifies delivered and blocked hardening guidance on the rendered Mission Control UI.
- `npm run verify:phase8-e2e` verifies the end-to-end mission path and asserts no local commit, branch push, or draft PR creation occurs.
- Final H5 sweep passed with `npm run typecheck`, `npm run build:web`, `npm run verify:phase8-e2e`, `npm run verify:phase8-rendered`, and `git diff --check`.
