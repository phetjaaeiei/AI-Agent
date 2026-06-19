import type { AgentExecutionRequest, AgentExecutionResult, AgentRuntimeInfo, AgentRuntimeMode } from "../../../shared/src/index.js";
import type { AgentExecutor } from "./agent-executor.js";
import { DeterministicAgentExecutor } from "./deterministic-executor.js";
import { OllamaAgentExecutor } from "./ollama-executor.js";

export class ResilientAgentExecutor implements AgentExecutor {
  constructor(
    private readonly configuredMode: AgentRuntimeMode,
    private readonly ollama = new OllamaAgentExecutor(),
    private readonly deterministic = new DeterministicAgentExecutor()
  ) {}

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    return this.ollama.getRuntimeInfo(this.configuredMode);
  }

  async execute(request: AgentExecutionRequest, signal: AbortSignal): Promise<AgentExecutionResult> {
    if (request.providerPreference === "deterministic" || this.configuredMode === "deterministic") {
      return this.deterministic.execute(request, signal);
    }
    const info = await this.getRuntimeInfo();
    if (!info.ollamaAvailable || !info.modelAvailable) {
      if (request.providerPreference === "ollama") return this.ollama.execute(request, signal);
      return this.deterministic.execute(request, signal);
    }
    return this.ollama.execute(request, signal);
  }
}
