# Next Implementation Plan: Phase 7 GitHub Repository Integration

Status: Phase 7 G4 completed, ready for branch publication on 2026-06-19

## 1. Current Position

The local autonomous mission controller is complete. It can advance planning, tool evidence, Git evidence, review packets, local CI, independent reviewers, and delivery reports with persisted recovery and bounded retries.

The project is now published at `https://github.com/phetjaaeiei/AI-Agent`. The local `main` branch tracks `origin/main`, GitHub CLI is authenticated as `phetjaaeiei`, and the complete project baseline was pushed successfully.

## 2. Completed Prerequisites

1. GitHub CLI installed and authenticated.
2. Repository access verified with admin/push permission.
3. Complete first-commit scope confirmed by the user.
4. Local repository initialized on `main` with `origin` configured.
5. Initial project baseline pushed with upstream tracking.

The project now has `.gitignore` rules for dependencies, build output, runtime state, environment files, logs, and private-key formats.

## 3. Milestone Decision

Continue **Phase 7: GitHub Repository Integration** with explicit runtime policy for future remote mutations.

```txt
local reviewed delivery
  -> branch policy
  -> explicit push permission
  -> GitHub draft PR
  -> remote check evidence
  -> human merge decision
```

## 4. Delivery Slices

### Slice G1: Repository Bootstrap And Remote Read

- completed: initialized the local repository with intentional first-commit scope;
- completed: connected `origin` to `phetjaaeiei/AI-Agent`;
- completed: verified default branch, repository access, and remote metadata;
- completed: exposed read-only remote health in Mission Control without storing credentials.

### Slice G2: Remote Mutation Policy

- completed: separate permissions for branch push and draft PR creation are reflected in policy preflight;
- completed: policy preflight requires an explicit delivered review packet before a future remote mutation can pass;
- completed: policy preflight records actor, branch, commit SHA, remote target, permission state, delivery evidence, blockers, and policy decision;
- completed: force push and branch deletion remain disabled.

### Slice G3: Draft Pull Request Connector

- completed: added guarded `branch_push` execution that can push a `codex/*` branch with upstream tracking only after policy and reviewed delivery pass;
- completed: added guarded `draft_pr_create` execution through `gh pr create --draft` after verifying the remote branch matches local HEAD;
- completed: draft PR bodies are hydrated from the reviewed delivery Markdown, including local CI, reviewer decisions, risks, rollback notes, and remote safety notes;
- completed: deterministic fixtures cover enabled branch push and fake draft PR creation without contacting GitHub;
- completed: default policy still blocks branch push and draft PR creation.

### Slice G4: Mission Control Remote Evidence

- completed: added read-only `remote_evidence` operation for repository, branch, local commit, remote branch commit, PR state, check summary, blocked actions, and retry reason;
- completed: distinguished `local_only`, `published_current`, `published_stale`, and `unknown` remote publication states;
- completed: Mission Control shows remote publication evidence, PR status, checks, retryable state, and still-blocked merge/deploy/force-push/branch-deletion actions;
- completed: network/auth/PR-status failures return retryable evidence without repeating commits or remote mutation;
- completed: deterministic local and fake-GitHub fixture coverage.

### Slice G5: Branch Publication And Draft PR

- current next slice;
- commit the completed Phase 7 changes on the existing `codex/*` branch;
- push the branch to `origin`;
- create a draft PR for human review;
- do not merge, deploy, force push, delete branches, or run production actions.

## 5. Not In This Milestone

- automatic merge;
- force push;
- branch deletion;
- production deploys;
- cloud model requirements;
- secret serialization;
- destructive Git reset/checkout.

## 6. Required Verification

- all existing local verification commands;
- deterministic remote-policy tests;
- GitHub authentication and repository access checks;
- dry-run/fixture coverage for push and draft PR idempotency;
- rendered QA for local-only, auth-missing, push-failed, and PR-created states.
