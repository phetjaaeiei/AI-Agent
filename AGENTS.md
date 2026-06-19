# AGENTS.md

## Team AI Agent Workspace Memory

When working in `/Users/extosoft003/Downloads/Work/AI-Agent`, automatically preserve durable project memory in:

`/Users/extosoft003/Documents/Obsidian Vault/AI-Agent`

Use the `obsidian-autosave` skill when available. The bundled skill is NHR-oriented, so adapt its folder conventions to the `AI-Agent` vault for this project.

Autosave after substantive work:

- code or configuration changes;
- implementation plans and milestone decisions;
- debugging findings;
- architecture or policy decisions;
- verification results;
- rendered QA notes;
- operational runbooks that Codex should reuse later.

Skip autosave for trivial chat or one-off checks with no durable value.

Never save raw secrets, passwords, tokens, private keys, complete auth headers, `.env` contents, or sensitive personal data. Record only safe secret names, masked placeholders, or high-level operational facts.

## Project Continuation Rules

Before continuing implementation, read:

- `docs/IMPLEMENTATION_PROGRESS.md`
- `docs/NEXT_IMPLEMENTATION_PLAN.md`
- relevant runbooks under `docs/`

Current runtime direction:

- Use local Ollama by default for live agent execution.
- Do not require OpenAI API keys unless the user explicitly asks for a cloud provider.
- Keep deterministic fallback visible and testable.
- Keep Git, remote push, deploy, and production actions disabled until their phase-specific policy exists.

## UI Work

For any frontend UI, UX, layout, CSS, accessibility, responsive behavior, or product-surface change:

- use the `impeccable` skill first;
- use React best-practice guidance for React changes;
- perform rendered QA when feasible;
- if the in-app Browser tool is unavailable, use Playwright fallback and record the reason.

## Phase Safety

Phase 3 local tools are allowed only through the tool-runner policy:

- workspace-root confinement;
- no `.env`, `.git`, `.data`, `node_modules`, `dist`, generated build folders, or private key reads;
- no arbitrary shell metacharacters;
- no remote Git or deploy behavior through generic shell.

Phase 4 Git Integration is complete and Git operations must use the Git-specific policy layer:

- local commit stays disabled unless `TEAM_AI_AGENT_ALLOW_GIT_COMMIT=true`;
- remote push and remote PR creation stay disabled unless explicit connector policy exists;
- destructive Git reset/checkout remains out of scope.

Phase 5 Review Loop And CI Evidence is complete. Review packets, completeness gates, local CI profiles, role decisions, and offline delivery reports are available through the orchestrator and Mission Control.

Phase 6 Autonomous Mission Completion is complete. The resumable local controller invokes existing agent, tool, Git, review, CI, reviewer, and delivery boundaries with bounded retries and visible stop reasons.

Phase 7 should connect the local repository to GitHub with explicit remote-read, push, draft-PR, and branch policy. Keep automatic merge, deployment, production actions, and destructive Git operations disabled.
