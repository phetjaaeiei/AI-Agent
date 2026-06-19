# Agent Runtime Evals

Run the credential-free deterministic baseline:

```sh
npm run eval:agent-runtime
```

Run the same service path against local Ollama:

```sh
AGENT_EVAL_PROVIDER=ollama OLLAMA_MODEL=qwen3:8b npm run eval:agent-runtime
```

The harness isolates state per case, exercises the real `AgentRunService`, writes `results/latest.json`, and exits non-zero when any grader fails.
