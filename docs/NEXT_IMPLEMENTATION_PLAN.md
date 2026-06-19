# Next Implementation Plan: Phase 7 GitHub Repository Integration

Status: Waiting for local GitHub CLI setup after Phase 6 completion on 2026-06-19

## 1. Current Position

The local autonomous mission controller is complete. It can advance planning, tool evidence, Git evidence, review packets, local CI, independent reviewers, and delivery reports with persisted recovery and bounded retries.

The user created `https://github.com/phetjaaeiei/AI-Agent`. The GitHub connector confirms it exists, uses `main`, is currently empty, and the connected account has admin/push permission. This workspace is not yet a Git repository and `gh` is not installed. No remote push has been performed.

## 2. Prerequisites

1. Install GitHub CLI: `brew install gh`
2. Authenticate: `gh auth login`
3. Verify: `gh auth status`
4. Confirm that the complete current workspace belongs in the first repository commit.

The project now has `.gitignore` rules for dependencies, build output, runtime state, environment files, logs, and private-key formats.

## 3. Milestone Decision

Start **Phase 7: GitHub Repository Integration** after prerequisites pass.

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

- initialize the local repository with intentional first-commit scope;
- connect `origin` to `phetjaaeiei/AI-Agent`;
- verify default branch, repository access, and remote metadata;
- expose remote-read health without storing credentials.

### Slice G2: Remote Mutation Policy

- separate permissions for branch push and draft PR creation;
- require an explicit reviewed delivery packet before push;
- record actor, branch, commit SHA, remote target, and policy decision;
- keep force push and branch deletion disabled.

### Slice G3: Draft Pull Request Connector

- push a `codex/*` branch with tracking;
- create a draft PR through the connected GitHub app, with `gh` fallback;
- attach local CI, reviewer decisions, risks, rollback notes, and delivery Markdown;
- never auto-merge.

### Slice G4: Mission Control Remote Evidence

- show repository, branch, remote commit, PR status, checks, and blocked actions;
- distinguish local-ready from remote-published states;
- add retry for network/auth failures without repeating commits;
- desktop and mobile rendered QA.

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
