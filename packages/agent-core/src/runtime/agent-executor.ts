import type { AgentExecutionRequest, AgentExecutionResult, AgentRunErrorCode } from "../../../shared/src/index.js";

export interface AgentExecutor {
  execute(request: AgentExecutionRequest, signal: AbortSignal): Promise<AgentExecutionResult>;
}

export class AgentExecutionError extends Error {
  constructor(
    readonly code: AgentRunErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AgentExecutionError";
  }
}
