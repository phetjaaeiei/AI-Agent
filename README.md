# AI-Agent

Team AI Agent is a local-first autonomous software team simulator. A mission is planned by specialized agents, executed through bounded local tools, checked with local Git evidence, reviewed by independent roles, verified through a local CI profile, and summarized in an offline delivery report.

## Local Runtime

- Ollama is the default live provider.
- `qwen3:8b` is the default local model.
- Deterministic fallback remains available when Ollama is unavailable.
- Remote push, pull-request creation, merge, and deployment stay disabled inside the agent runtime by default.

## Start

```bash
npm install
ollama pull qwen3:8b
npm run dev:orchestrator
```

In another terminal:

```bash
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Verification

```bash
npm run typecheck
npm run verify:foundation
npm run verify:agent-runtime
npm run verify:tool-runner
npm run verify:git-runner
npm run verify:review-packet
npm run verify:mission-controller
npm run verify:orchestrator
npm run build:web
```

## Documentation

- Current progress: [`docs/IMPLEMENTATION_PROGRESS.md`](docs/IMPLEMENTATION_PROGRESS.md)
- Next implementation plan: [`docs/NEXT_IMPLEMENTATION_PLAN.md`](docs/NEXT_IMPLEMENTATION_PLAN.md)
- Local Ollama runtime: [`docs/OLLAMA_AGENT_RUNTIME.md`](docs/OLLAMA_AGENT_RUNTIME.md)
- Review and CI policy: [`docs/REVIEW_LOOP_AND_CI.md`](docs/REVIEW_LOOP_AND_CI.md)
