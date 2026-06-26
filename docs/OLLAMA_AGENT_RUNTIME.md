# Ollama Agent Runtime

## Purpose

Milestone C runs the Product Manager planner and Lead BA verifier locally through Ollama. No OpenAI API key or paid cloud API is required. The orchestrator keeps a deterministic executor for CI, failure tests, and fallback when Ollama or the configured model is unavailable.

## Local Setup

```sh
brew install ollama
brew services start ollama
ollama pull qwen3:8b
```

Default runtime configuration:

```txt
AGENT_RUNTIME_MODE=auto
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
```

`auto` uses Ollama only when both the service and model are available. Otherwise it records `deterministic` as the provider so the UI never presents fallback output as a live model run.

## Runtime Flow

```txt
Mission command
  -> Product Manager planner
  -> validated Mission Plan JSON
  -> Lead BA verifier
  -> weighted planning score
  -> pass, revise once, or block
  -> artifact, audit, event stream, and mission snapshot
```

Ollama receives no file, shell, browser, Git, deployment, or external network tools in Milestone C.

## Automatic Learning Queue

Mission Control may auto-capture local evidence as Ollama learning candidates when real mission artifacts are produced by the agent runtime, tool runner, Git runner, review service, orchestrator, or local fallback. This queue is for future local training workflows and prompt/eval improvement.

Current safety boundary:

- capture is local-only and derived from persisted mission evidence;
- seeded demo artifacts are deprioritized behind real mission evidence;
- secret paths, denied paths, and raw credentials must not be serialized into learning candidates;
- Ollama model mutation, fine-tuning, adapter creation, and replacement of the active model remain disabled until a dedicated training policy exists;
- the UI must show capture state and policy state, so training behavior is never hidden from the operator.

## Commands

```sh
npm run verify:agent-runtime
npm run verify:orchestrator
npm run verify:ollama
npm run eval:agent-runtime
AGENT_EVAL_PROVIDER=ollama npm run eval:agent-runtime
```

## HTTP Surface

- `GET /api/mission/agent-runtime`
- `GET /api/mission/agent-runs`
- `POST /api/mission/agent-runs`
- `GET /api/mission/agent-runs/:runId`
- `GET /api/mission/agent-runs/:runId/events`
- `POST /api/mission/agent-runs/:runId/cancel`
- `POST /api/mission/agent-runs/:runId/retry`

The event endpoint uses Server-Sent Events. Run, artifact, audit, gate, and mission state are persisted before Mission Control presents completion.

## Official References

- Ollama API: https://docs.ollama.com/api
- Structured outputs: https://docs.ollama.com/capabilities/structured-outputs
- macOS installation: https://docs.ollama.com/macos
