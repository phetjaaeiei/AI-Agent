import { randomUUID } from "node:crypto";
import type {
  AgentRuntimeMode,
  LocalReviewerResult,
  ReviewPacket,
  ReviewerDecision,
  RoleId
} from "../../../shared/src/index.js";

export type ReviewExecutionRequest = {
  packet: ReviewPacket;
  reviewerRoleId: RoleId;
};

export interface ReviewExecutor {
  execute(request: ReviewExecutionRequest, signal: AbortSignal): Promise<LocalReviewerResult>;
}

export class DeterministicReviewExecutor implements ReviewExecutor {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async execute(request: ReviewExecutionRequest, signal: AbortSignal): Promise<LocalReviewerResult> {
    if (signal.aborted) throw new Error("Reviewer execution was cancelled.");
    const evidenceRequirements = request.packet.requirements.filter((item) => item.id !== "reviewer_approval");
    const blocked = evidenceRequirements.filter((item) => item.status === "block");
    const missing = evidenceRequirements.filter((item) => item.status === "missing");
    const decision = blocked.length > 0 ? "block" : missing.length > 0 ? "revise" : "pass";
    const defects = [...blocked, ...missing].map((item) => `${item.label}: ${item.summary}`);
    return {
      reviewerRoleId: request.reviewerRoleId,
      decision,
      summary: decision === "pass"
        ? `${roleLabel(request.reviewerRoleId)} verified the local evidence packet.`
        : `${roleLabel(request.reviewerRoleId)} found ${defects.length} unresolved evidence item(s).`,
      defects,
      evidenceIds: evidenceRequirements.flatMap((item) => item.evidenceIds),
      provider: "deterministic",
      model: "deterministic-reviewer-v1",
      reviewedAt: this.now()
    };
  }
}

export class OllamaReviewExecutor implements ReviewExecutor {
  readonly baseUrl: string;
  readonly model: string;

  constructor(options: { baseUrl?: string; model?: string; fetchImpl?: typeof fetch; now?: () => string } = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.model = options.model ?? "qwen3:8b";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private readonly fetchImpl: typeof fetch;
  private readonly now: () => string;

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) return false;
      const payload = await response.json() as { models?: readonly { name?: string; model?: string }[] };
      return Boolean(payload.models?.some((item) => item.name === this.model || item.model === this.model));
    } catch {
      return false;
    }
  }

  async execute(request: ReviewExecutionRequest, signal: AbortSignal): Promise<LocalReviewerResult> {
    const safePacket = {
      id: request.packet.id,
      status: request.packet.status,
      requirements: request.packet.requirements,
      risks: request.packet.risks,
      evidence: request.packet.evidence
    };
    const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        think: false,
        format: reviewSchema,
        options: { temperature: 0 },
        messages: [
          {
            role: "system",
            content: `You are the independent ${roleLabel(request.reviewerRoleId)} reviewer. Never pass blocked or missing non-reviewer evidence. Return JSON only.`
          },
          { role: "user", content: `Review packet: ${JSON.stringify(safePacket)}` }
        ]
      }),
      signal
    });
    if (!response.ok) throw new Error(`Ollama reviewer request failed with ${response.status}.`);
    const payload = await response.json() as { model?: string; message?: { content?: string } };
    const output = JSON.parse(payload.message?.content ?? "null") as Partial<Pick<LocalReviewerResult, "decision" | "summary" | "defects" | "evidenceIds">>;
    if (!output || !["pass", "revise", "block"].includes(output.decision ?? "") || typeof output.summary !== "string" || !Array.isArray(output.defects) || !Array.isArray(output.evidenceIds)) {
      throw new Error("Ollama reviewer output is invalid.");
    }
    const nonReviewerOpen = request.packet.requirements.some((item) => item.id !== "reviewer_approval" && item.status !== "pass");
    const decision = output.decision as ReviewerDecision;
    return {
      reviewerRoleId: request.reviewerRoleId,
      decision: nonReviewerOpen && decision === "pass" ? "revise" : decision,
      summary: output.summary,
      defects: output.defects.filter((item): item is string => typeof item === "string"),
      evidenceIds: output.evidenceIds.filter((item): item is string => typeof item === "string"),
      provider: "ollama",
      model: payload.model ?? this.model,
      reviewedAt: this.now()
    };
  }
}

export class ResilientReviewExecutor implements ReviewExecutor {
  constructor(
    private readonly configuredMode: AgentRuntimeMode,
    private readonly ollama = new OllamaReviewExecutor(),
    private readonly deterministic = new DeterministicReviewExecutor()
  ) {}

  async execute(request: ReviewExecutionRequest, signal: AbortSignal): Promise<LocalReviewerResult> {
    if (this.configuredMode === "deterministic") return this.deterministic.execute(request, signal);
    if (!(await this.ollama.isAvailable())) {
      if (this.configuredMode === "ollama") return this.ollama.execute(request, signal);
      return this.deterministic.execute(request, signal);
    }
    try {
      return await this.ollama.execute(request, signal);
    } catch (error) {
      if (this.configuredMode === "ollama" || signal.aborted) throw error;
      return this.deterministic.execute(request, signal);
    }
  }
}

function roleLabel(roleId: RoleId): string {
  return roleId.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

const stringArray = { type: "array", items: { type: "string" } };
const reviewSchema = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["pass", "revise", "block"] },
    summary: { type: "string" },
    defects: stringArray,
    evidenceIds: stringArray,
    traceId: { type: "string", default: `review-${randomUUID()}` }
  },
  required: ["decision", "summary", "defects", "evidenceIds"]
};
