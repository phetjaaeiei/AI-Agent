import { randomUUID } from "node:crypto";
import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentRuntimeInfo,
  MissionPlanOutput,
  PlanningVerificationOutput
} from "../../../shared/src/index.js";
import { isMissionPlanOutput, isPlanningVerificationOutput } from "../../../shared/src/index.js";
import { ROLE_IDS } from "../../../shared/src/index.js";
import { AgentExecutionError } from "./agent-executor.js";
import type { AgentExecutor } from "./agent-executor.js";

type OllamaExecutorOptions = {
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

type OllamaChatResponse = {
  model?: string;
  message?: { content?: string };
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
};

export class OllamaAgentExecutor implements AgentExecutor {
  readonly baseUrl: string;
  readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaExecutorOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.model = options.model ?? "qwen3:8b";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getRuntimeInfo(configuredMode: AgentRuntimeInfo["configuredMode"]): Promise<AgentRuntimeInfo> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
      const payload = await response.json() as { models?: readonly { name?: string; model?: string }[] };
      const modelAvailable = Boolean(payload.models?.some((item) => item.name === this.model || item.model === this.model));
      return {
        configuredMode,
        activeProvider: modelAvailable && configuredMode !== "deterministic" ? "ollama" : "deterministic",
        ollamaAvailable: true,
        ollamaBaseUrl: this.baseUrl,
        model: this.model,
        modelAvailable,
        message: modelAvailable ? `Ollama is ready with ${this.model}.` : `Ollama is running, but ${this.model} is not installed.`
      };
    } catch {
      return {
        configuredMode,
        activeProvider: "deterministic",
        ollamaAvailable: false,
        ollamaBaseUrl: this.baseUrl,
        model: this.model,
        modelAvailable: false,
        message: "Ollama is unavailable. Deterministic fallback is active."
      };
    }
  }

  async execute(request: AgentExecutionRequest, signal: AbortSignal): Promise<AgentExecutionResult> {
    const startedAt = Date.now();
    const schema = request.kind === "planner" ? missionPlanSchema : verificationSchema;
    const response = await this.requestChat(request, schema, signal);
    const rawContent = response.message?.content;
    if (!rawContent) throw new AgentExecutionError("invalid_output", "Ollama returned no structured content.");

    let output: unknown;
    try {
      output = JSON.parse(rawContent);
    } catch {
      throw new AgentExecutionError("invalid_output", "Ollama returned invalid JSON.");
    }

    if (request.kind === "planner" && !isMissionPlanOutput(output)) {
      throw new AgentExecutionError("invalid_output", "Ollama planner output does not match the Mission Plan schema.");
    }
    if (request.kind === "verifier" && !isPlanningVerificationOutput(output)) {
      throw new AgentExecutionError("invalid_output", "Ollama verifier output does not match the verification schema.");
    }

    return {
      provider: "ollama",
      model: response.model ?? this.model,
      traceId: `trace-ollama-${randomUUID()}`,
      usage: {
        inputTokens: response.prompt_eval_count ?? 0,
        outputTokens: response.eval_count ?? 0,
        durationMs: response.total_duration ? Math.round(response.total_duration / 1_000_000) : Date.now() - startedAt
      },
      output: output as MissionPlanOutput | PlanningVerificationOutput
    };
  }

  private async requestChat(
    request: AgentExecutionRequest,
    schema: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<OllamaChatResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          think: false,
          format: schema,
          options: { temperature: 0 },
          messages: createMessages(request, schema)
        }),
        signal
      });
    } catch (error) {
      if (signal.aborted) throw new AgentExecutionError("cancelled", "Ollama execution was cancelled.");
      throw new AgentExecutionError("provider_unavailable", error instanceof Error ? error.message : "Ollama is unavailable.");
    }

    if (!response.ok) {
      const body = await response.text();
      const code = response.status === 404 || body.toLowerCase().includes("not found") ? "model_missing" : "provider_error";
      throw new AgentExecutionError(code, `Ollama request failed with ${response.status}.`);
    }
    return await response.json() as OllamaChatResponse;
  }
}

function createMessages(request: AgentExecutionRequest, schema: Record<string, unknown>) {
  const schemaText = JSON.stringify(schema);
  if (request.kind === "planner") {
    const revision = request.revisionFeedback?.length ? `\nRevision feedback:\n- ${request.revisionFeedback.join("\n- ")}` : "";
    return [
      { role: "system", content: "You are the Product Manager. Produce a precise mission plan only. Do not approve your own work. Return JSON matching the provided schema." },
      { role: "user", content: `Mission: ${request.command}${revision}\nJSON schema: ${schemaText}` }
    ];
  }
  return [
    { role: "system", content: "You are the independent Lead BA verifier. Check evidence, score conservatively, and choose pass, revise, or block. Return JSON matching the provided schema." },
    { role: "user", content: `Mission: ${request.command}\nPlanner output: ${JSON.stringify(request.plannerOutput)}\nJSON schema: ${schemaText}` }
  ];
}

const stringArray = { type: "array", items: { type: "string" } };
const missionPlanSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    productGoal: { type: "string" }, scopeIn: stringArray, scopeOut: stringArray, userStories: stringArray,
    acceptanceCriteria: stringArray, assumptions: stringArray, openQuestions: stringArray,
    risks: { type: "array", items: { type: "object", properties: { summary: { type: "string" }, ownerRoleId: { type: "string", enum: ROLE_IDS }, level: { type: "string", enum: ["low", "medium", "high"] } }, required: ["summary", "ownerRoleId", "level"] } },
    evidenceRefs: stringArray, confidence: { type: "number", minimum: 0, maximum: 100 }
  },
  required: ["productGoal", "scopeIn", "scopeOut", "userStories", "acceptanceCriteria", "assumptions", "openQuestions", "risks", "evidenceRefs", "confidence"]
};
const scoreSchema = { type: "number", minimum: 0, maximum: 100 };
const verificationSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    scores: { type: "object", properties: { completeness: scoreSchema, correctness: scoreSchema, consistency: scoreSchema, verifiability: scoreSchema, riskControl: scoreSchema }, required: ["completeness", "correctness", "consistency", "verifiability", "riskControl"] },
    defects: { type: "array", items: { type: "object", properties: { severity: { type: "string", enum: ["low", "medium", "high", "critical"] }, summary: { type: "string" }, evidence: { type: "string" } }, required: ["severity", "summary", "evidence"] } },
    decision: { type: "string", enum: ["pass", "revise", "block"] }, requiredRevisions: stringArray,
    confidence: { type: "number", minimum: 0, maximum: 100 }
  },
  required: ["scores", "defects", "decision", "requiredRevisions", "confidence"]
};
