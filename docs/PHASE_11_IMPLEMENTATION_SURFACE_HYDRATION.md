# Phase 11 Implementation Surface Hydration

Date: 2026-06-26

## Goal

Phase 11 makes generated implementation surface modules a first-class preview source in Mission Control while preserving Phase 10's bounded patch policy.

The browser must not gain arbitrary file reads, dynamic workspace imports, shell execution, remote Git mutation, deployment, merge, force-push, branch deletion, destructive Git, secret serialization, model mutation, or unbounded autonomous loop behavior.

## P11.1 Surface Module Hydration

P11.1 connects the frontend preview card to the same allowlisted generated surface modules that the controller writes:

- `apps/web/src/utils/implementation-surfaces.ts` imports the three allowlisted generated surface modules;
- `ImplementationPreviewCard` accepts a surface module registry and resolves a module by exact target path;
- if the latest `Local Code Patch` points at a generated surface module, the preview renders that module's surface model;
- if no matching module exists, the previous patch-artifact fallback still renders;
- live Mission Control and recovered mission archives both pass the same registry.

This is intentionally static and explicit. It does not add arbitrary dynamic imports or browser reads from the workspace.

## P11.2 Surface Module Contract Hardening

Potential next slice:

- move repeated generated surface module types into a shared frontend type helper;
- add focused contract verification for module target resolution;
- consider a small source label in Mission Control if users need to distinguish manifest data, surface module data, and archived patch fallback data.

## Verification

P11.1 verification:

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
