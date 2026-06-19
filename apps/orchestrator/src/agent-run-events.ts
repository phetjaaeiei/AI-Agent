import type { AgentRunEvent } from "../../../packages/shared/src/index.js";

type AgentRunEventListener = (event: AgentRunEvent) => void;

export class AgentRunEventBroker {
  private readonly listeners = new Map<string, Set<AgentRunEventListener>>();

  subscribe(runId: string, listener: AgentRunEventListener): () => void {
    const listeners = this.listeners.get(runId) ?? new Set<AgentRunEventListener>();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(runId);
    };
  }

  publish(event: AgentRunEvent): void {
    for (const listener of this.listeners.get(event.runId) ?? []) listener(event);
  }
}
