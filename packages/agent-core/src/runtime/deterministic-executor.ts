import { randomUUID } from "node:crypto";
import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  MissionPlanOutput,
  PlanningVerificationOutput
} from "../../../shared/src/index.js";
import { AgentExecutionError } from "./agent-executor.js";
import type { AgentExecutor } from "./agent-executor.js";

export class DeterministicAgentExecutor implements AgentExecutor {
  async execute(request: AgentExecutionRequest, signal: AbortSignal): Promise<AgentExecutionResult> {
    const startedAt = Date.now();
    await abortableDelay(8, signal);

    if (request.command.includes("[invalid-output]")) {
      throw new AgentExecutionError("invalid_output", "Deterministic fixture produced an invalid structured output.");
    }

    const output = request.kind === "planner" ? createDeterministicPlan(request) : createDeterministicVerification(request);
    const outputText = JSON.stringify(output);

    return {
      provider: "deterministic",
      model: "deterministic-v1",
      traceId: `trace-deterministic-${randomUUID()}`,
      usage: {
        inputTokens: estimateTokens(request.command),
        outputTokens: estimateTokens(outputText),
        durationMs: Date.now() - startedAt
      },
      output
    };
  }
}

function createDeterministicPlan(request: AgentExecutionRequest): MissionPlanOutput {
  const revisionNote = request.revisionFeedback?.length
    ? ` Revised after feedback: ${request.revisionFeedback.join(" ")}`
    : "";
  return {
    productGoal: `${request.command.trim()}${revisionNote}`,
    scopeIn: ["Mission planning", "Measurable acceptance criteria", "Independent verification"],
    scopeOut: ["Production deployment", "Unapproved external side effects"],
    userStories: [
      "As a mission owner, I can inspect the plan before execution.",
      "As a verifier, I can trace each acceptance criterion to evidence."
    ],
    acceptanceCriteria: [
      "The mission goal is explicit.",
      "Scope in and scope out are recorded.",
      "Every risk has an owner.",
      "The planning gate has independent evidence."
    ],
    assumptions: ["The mission command is the current source of truth."],
    openQuestions: request.command.toLowerCase().includes("repository") ? [] : ["Which repository should later execution target?"],
    risks: [
      { summary: "Ambiguous implementation target", ownerRoleId: "product_manager", level: "medium" },
      { summary: "Planner output may omit evidence", ownerRoleId: "lead_ba", level: "medium" }
    ],
    evidenceRefs: ["Mission command", "Role registry", "Planning gate criteria"],
    confidence: request.attempt > 1 ? 91 : 86
  };
}

function createDeterministicVerification(request: AgentExecutionRequest): PlanningVerificationOutput {
  if (!request.plannerOutput) {
    throw new AgentExecutionError("invalid_output", "Verifier execution requires planner output.");
  }

  const forceBlock = request.command.includes("[block]");
  const forceRevision = request.command.includes("[revise]") && request.attempt === 1;

  if (forceBlock) {
    return {
      scores: { completeness: 45, correctness: 50, consistency: 55, verifiability: 35, riskControl: 40 },
      defects: [{ severity: "critical", summary: "Mission is intentionally blocked by the verification fixture.", evidence: "[block] test marker" }],
      decision: "block",
      requiredRevisions: ["Remove the blocking condition and provide verifiable scope."],
      confidence: 96
    };
  }

  if (forceRevision) {
    return {
      scores: { completeness: 72, correctness: 78, consistency: 80, verifiability: 68, riskControl: 74 },
      defects: [{ severity: "high", summary: "Evidence needs a clearer revision trail.", evidence: "[revise] test marker" }],
      decision: "revise",
      requiredRevisions: ["Add the verifier feedback to the revised product goal."],
      confidence: 92
    };
  }

  return {
    scores: { completeness: 90, correctness: 88, consistency: 89, verifiability: 86, riskControl: 85 },
    defects: [],
    decision: "pass",
    requiredRevisions: [],
    confidence: 91
  };
}

function abortableDelay(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new AgentExecutionError("cancelled", "Agent run was cancelled."));
      return;
    }
    const timer = setTimeout(resolve, durationMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new AgentExecutionError("cancelled", "Agent run was cancelled."));
    }, { once: true });
  });
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
