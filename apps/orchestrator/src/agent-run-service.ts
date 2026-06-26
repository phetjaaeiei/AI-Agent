import { randomUUID } from "node:crypto";
import type { AgentExecutor } from "../../../packages/agent-core/src/index.js";
import { AgentExecutionError } from "../../../packages/agent-core/src/index.js";
import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentProvider,
  AgentRunErrorCode,
  AgentRunEvent,
  AgentRunRecord,
  AgentRuntimeInfo,
  AgentRuntimeMode,
  AgentUsage,
  MissionPlanOutput,
  PlanningVerificationOutput
} from "../../../packages/shared/src/index.js";
import { isMissionPlanOutput, isPlanningVerificationOutput } from "../../../packages/shared/src/index.js";
import {
  calculateAccuracyScore,
  createRuntimeArtifactRecord,
  createRuntimeAuditEvent,
  createRuntimeMissionState,
  createRuntimeSessionSnapshot
} from "../../../packages/workflow/src/index.js";
import type { RuntimeArtifactContent, RuntimeArtifactSection } from "../../../packages/workflow/src/index.js";
import type { AgentRunEventBroker } from "./agent-run-events.js";
import type { AgentRunStore } from "./agent-run-store.js";
import type { ArtifactContentStore } from "./artifact-content-store.js";
import type { MissionStore } from "./mission-store.js";

export type StartAgentRunInput = {
  missionId: string;
  command: string;
  taskId?: string;
  idempotencyKey?: string;
  providerPreference?: AgentRuntimeMode;
};

type AgentRunServiceOptions = {
  executor: AgentExecutor;
  runtimeInfo: () => Promise<AgentRuntimeInfo>;
  runStore: AgentRunStore;
  missionStore: MissionStore;
  artifactStore: ArtifactContentStore;
  eventBroker: AgentRunEventBroker;
  now?: () => string;
  timeoutMs?: number;
  maxRevisions?: number;
};

export class AgentRunService {
  private readonly controllers = new Map<string, AbortController>();
  private readonly now: () => string;
  private readonly timeoutMs: number;
  private readonly maxRevisions: number;

  constructor(private readonly options: AgentRunServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxRevisions = options.maxRevisions ?? 1;
  }

  getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    return this.options.runtimeInfo();
  }

  listRuns(missionId?: string): Promise<AgentRunRecord[]> {
    return this.options.runStore.listRuns(missionId);
  }

  getRun(runId: string): Promise<AgentRunRecord | undefined> {
    return this.options.runStore.findRun(runId);
  }

  getEvents(runId: string): Promise<AgentRunEvent[]> {
    return this.options.runStore.listEvents(runId);
  }

  subscribe(runId: string, listener: (event: AgentRunEvent) => void): () => void {
    return this.options.eventBroker.subscribe(runId, listener);
  }

  async startRun(input: StartAgentRunInput): Promise<AgentRunRecord> {
    const command = input.command.trim();
    if (!command) throw new Error("Mission command is required.");
    const idempotencyKey = input.idempotencyKey?.trim() || `${input.missionId}:${command}`;
    const existing = await this.options.runStore.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    const createdAt = this.now();
    const run: AgentRunRecord = {
      schemaVersion: 1,
      id: `agent-run-${randomUUID()}`,
      idempotencyKey,
      missionId: input.missionId,
      taskId: input.taskId ?? "task-mission-planning",
      roleId: "product_manager",
      verifierRoleId: "lead_ba",
      status: "queued",
      attempt: 1,
      provider: "deterministic",
      model: "pending",
      command,
      inputArtifactIds: [],
      traceIds: [],
      usage: emptyUsage(),
      createdAt,
      updatedAt: createdAt
    };
    await this.options.runStore.upsertRun(run);
    await this.emit(run, "status", "product_manager", "Mission planning queued", "The Product Manager run is waiting for local execution.");
    queueMicrotask(() => void this.executeRun(run.id, input.providerPreference ?? "auto"));
    return run;
  }

  async cancelRun(runId: string): Promise<AgentRunRecord | undefined> {
    const run = await this.getRun(runId);
    if (!run || isTerminal(run.status)) return run;
    this.controllers.get(runId)?.abort();
    const cancelled = await this.patchRun(run, {
      status: "cancelled",
      errorCode: "cancelled",
      errorSummary: "Run cancelled by user.",
      completedAt: this.now(),
      updatedAt: this.now()
    });
    await this.emit(cancelled, "status", cancelled.roleId, "Agent run cancelled", "No further planner or verifier work will be accepted for this run.");
    return cancelled;
  }

  async retryRun(runId: string): Promise<AgentRunRecord> {
    const run = await this.getRun(runId);
    if (!run) throw new Error("Agent run not found.");
    if (!["failed", "blocked", "cancelled"].includes(run.status)) throw new Error("Only failed, blocked, or cancelled runs can be retried.");
    return this.startRun({
      missionId: run.missionId,
      taskId: run.taskId,
      command: run.command,
      idempotencyKey: `${run.id}:retry:${run.attempt + 1}`,
      providerPreference: run.provider === "ollama" ? "ollama" : "auto"
    });
  }

  async waitForTerminalRun(runId: string, timeoutMs = 5000): Promise<AgentRunRecord> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const run = await this.getRun(runId);
      if (run && isTerminal(run.status)) return run;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${runId}.`);
  }

  private async executeRun(runId: string, providerPreference: AgentRuntimeMode): Promise<void> {
    let run = await this.getRun(runId);
    if (!run || run.status === "cancelled") return;
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      run = await this.patchRun(run, { status: "running", startedAt: this.now(), updatedAt: this.now() });
      await this.emit(run, "progress", "product_manager", "Product Manager planning", "Creating scope, acceptance criteria, assumptions, risks, and evidence references.");
      let planResult = await this.executeAgent(createPlannerRequest(run, providerPreference), controller.signal);
      let plan = requirePlan(planResult);
      run = await this.recordResult(run, planResult);

      let verificationResult: AgentExecutionResult | undefined;
      let verification: PlanningVerificationOutput | undefined;
      for (let revision = 0; revision <= this.maxRevisions; revision += 1) {
        run = await this.patchRun(run, { status: "verifying", updatedAt: this.now() });
        await this.emit(run, "verification", "lead_ba", "Lead BA verification", "Scoring the plan against evidence and the planning gate threshold.");
        verificationResult = await this.executeAgent(createVerifierRequest(run, providerPreference, plan), controller.signal);
        verification = requireVerification(verificationResult);
        run = await this.recordResult(run, verificationResult);
        const score = calculateAccuracyScore(verification.scores).overall;
        if (verification.decision === "pass" && score >= 80) break;
        if (verification.decision === "block" || revision === this.maxRevisions) break;

        run = await this.patchRun(run, { status: "revising", attempt: run.attempt + 1, updatedAt: this.now() });
        await this.emit(run, "progress", "product_manager", "Plan revision requested", verification.requiredRevisions.join(" ") || "The verifier requested stronger evidence.");
        planResult = await this.executeAgent(createPlannerRequest(run, providerPreference, verification.requiredRevisions), controller.signal);
        plan = requirePlan(planResult);
        run = await this.recordResult(run, planResult);
      }

      if (!verification || !verificationResult) throw new AgentExecutionError("invalid_output", "Verifier produced no result.");
      const score = calculateAccuracyScore(verification.scores).overall;
      const passed = verification.decision === "pass" && score >= 80;
      const artifact = await this.persistOutcome(run, plan, verification, score, passed);
      const completedAt = this.now();
      run = await this.patchRun(run, {
        status: passed ? "completed" : "blocked",
        outputArtifactId: artifact.id,
        verification,
        completedAt,
        updatedAt: completedAt
      });
      await this.emit(
        run,
        passed ? "artifact" : "verification",
        passed ? "product_manager" : "lead_ba",
        passed ? "Planning gate passed" : "Planning gate blocked",
        passed ? `Mission Plan verified at ${score}/100.` : `Verification stopped at ${score}/100 with ${verification.defects.length} defect(s).`
      );
    } catch (error) {
      run = await this.getRun(runId);
      if (!run || run.status === "cancelled") return;
      const normalized = normalizeError(error, timedOut);
      const failed = await this.patchRun(run, {
        status: normalized.code === "cancelled" ? "cancelled" : "failed",
        errorCode: normalized.code,
        errorSummary: normalized.message,
        completedAt: this.now(),
        updatedAt: this.now()
      });
      await this.emit(failed, "error", failed.roleId, "Agent run failed", normalized.message);
      await this.persistFailureAudit(failed);
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(runId);
    }
  }

  private executeAgent(request: AgentExecutionRequest, signal: AbortSignal): Promise<AgentExecutionResult> {
    return this.options.executor.execute(request, signal);
  }

  private async recordResult(run: AgentRunRecord, result: AgentExecutionResult): Promise<AgentRunRecord> {
    return this.patchRun(run, {
      provider: result.provider,
      model: result.model,
      traceIds: [...run.traceIds, result.traceId],
      usage: addUsage(run.usage, result.usage),
      updatedAt: this.now()
    });
  }

  private async persistOutcome(
    run: AgentRunRecord,
    plan: MissionPlanOutput,
    verification: PlanningVerificationOutput,
    score: number,
    passed: boolean
  ): Promise<RuntimeArtifactContent> {
    const createdAt = this.now();
    const current = await this.options.missionStore.readSession();
    const artifactRecord = createRuntimeArtifactRecord({
      artifactId: "art-mission-plan",
      taskId: run.taskId,
      title: "Mission Plan",
      summary: plan.productGoal,
      ownerRoleId: "product_manager",
      gateId: "planning_gate",
      status: passed ? "verified" : "reviewing",
      version: current.artifactRecords.filter((item) => item.artifactId === "art-mission-plan").length + 1,
      createdAt
    });
    const sections: RuntimeArtifactSection[] = [
      { heading: "Product Goal", body: plan.productGoal, evidence: plan.evidenceRefs },
      { heading: "Scope", body: `In: ${plan.scopeIn.join("; ")}`, evidence: plan.scopeOut.map((item) => `Out: ${item}`) },
      { heading: "Acceptance Criteria", body: plan.userStories.join(" "), evidence: plan.acceptanceCriteria },
      { heading: "Assumptions And Risks", body: plan.assumptions.join(" "), evidence: [...plan.openQuestions, ...plan.risks.map((risk) => `${risk.level}: ${risk.summary} (${risk.ownerRoleId})`)] },
      { heading: "Independent Verification", body: `${verification.decision} at ${score}/100. Confidence ${verification.confidence}%.`, evidence: verification.defects.length ? verification.defects.map((defect) => `${defect.severity}: ${defect.summary} (${defect.evidence})`) : ["No blocking defects"] }
    ];
    const artifact: RuntimeArtifactContent = {
      schemaVersion: 1,
      id: `artifact-content-art-mission-plan-v${artifactRecord.version}`,
      artifactRecordId: artifactRecord.id,
      artifactId: artifactRecord.artifactId,
      taskId: artifactRecord.taskId,
      missionId: run.missionId,
      title: artifactRecord.title,
      summary: artifactRecord.summary,
      ownerRoleId: artifactRecord.ownerRoleId,
      gateId: artifactRecord.gateId,
      status: artifactRecord.status,
      version: artifactRecord.version,
      format: "markdown",
      source: "agent_runtime",
      sections,
      markdown: formatMarkdown(artifactRecord.title, sections),
      createdAt,
      updatedAt: createdAt
    };
    await this.options.artifactStore.appendArtifact(artifact);
    const audit = createRuntimeAuditEvent({
      id: `audit-agent-run-${run.id}`,
      actorRoleId: passed ? "lead_ba" : "product_manager",
      action: "agent_run_completed",
      summary: passed ? `Agent run ${run.id} passed planning verification.` : `Agent run ${run.id} was blocked by planning verification.`,
      severity: passed ? "success" : "warning",
      entityId: run.id,
      createdAt
    });
    const nextSnapshot = createRuntimeSessionSnapshot({
      ...current,
      missionState: createRuntimeMissionState({
        commandDraft: current.commandDraft,
        missionPlan: current.missionPlan,
        savedAt: createdAt,
        previousState: current.missionState,
        source: "agent_runtime",
        status: passed ? current.missionState.status === "running" ? "running" : "saved" : "blocked",
        statusReason: passed ? `Planning artifact verified at ${score}/100.` : `Planning verification stopped at ${score}/100.`
      }),
      runtime: {
        ...current.runtime,
        gateRuns: {
          ...current.runtime.gateRuns,
          planning_gate: {
            gateId: "planning_gate",
            ownerRoleId: "lead_ba",
            status: passed ? "passed" : "blocked",
            score,
            note: passed ? "Mission Plan passed independent Lead BA verification." : verification.requiredRevisions.join(" ") || "Planning verification blocked the mission.",
            lastUpdated: createdAt
          }
        },
        taskRuns: { ...current.runtime.taskRuns, [run.taskId]: passed ? "passed" : "blocked" },
        activityLog: [{
          id: `evt-agent-run-${run.id}`,
          roleId: passed ? "lead_ba" : "product_manager",
          type: passed ? "artifact" : "risk",
          title: passed ? "Mission Plan verified" : "Mission Plan blocked",
          summary: passed ? `Local agent planning passed at ${score}/100.` : `Local agent planning stopped at ${score}/100.`,
          tone: passed ? "success" : "danger",
          time: formatTime(createdAt)
        }, ...current.runtime.activityLog]
      },
      selection: {
        selectedGateId: "planning_gate",
        selectedRoleId: passed ? "lead_ba" : "product_manager",
        selectedRoomId: "product",
        selectedArtifactId: "art-mission-plan"
      },
      artifactRecords: [artifactRecord, ...current.artifactRecords].slice(0, 100),
      auditEvents: [audit, ...current.auditEvents].slice(0, 200),
      savedAt: createdAt
    });
    await this.options.missionStore.writeSession(nextSnapshot);
    return artifact;
  }

  private async persistFailureAudit(run: AgentRunRecord): Promise<void> {
    const current = await this.options.missionStore.readSession();
    const createdAt = this.now();
    const audit = createRuntimeAuditEvent({
      id: `audit-agent-run-failed-${run.id}`,
      actorRoleId: run.roleId,
      action: "agent_run_failed",
      summary: `${run.errorCode ?? "provider_error"}: ${run.errorSummary ?? "Agent run failed."}`,
      severity: "danger",
      entityId: run.id,
      createdAt
    });
    await this.options.missionStore.writeSession(createRuntimeSessionSnapshot({
      ...current,
      missionState: createRuntimeMissionState({
        commandDraft: current.commandDraft,
        missionPlan: current.missionPlan,
        savedAt: createdAt,
        previousState: current.missionState,
        source: "agent_runtime",
        status: "blocked",
        statusReason: `${run.errorCode ?? "provider_error"}: ${run.errorSummary ?? "Agent run failed."}`
      }),
      auditEvents: [audit, ...current.auditEvents].slice(0, 200),
      savedAt: createdAt
    }));
  }

  private patchRun(run: AgentRunRecord, patch: Partial<AgentRunRecord>): Promise<AgentRunRecord> {
    return this.options.runStore.upsertRun({ ...run, ...patch });
  }

  private async emit(
    run: AgentRunRecord,
    type: AgentRunEvent["type"],
    roleId: AgentRunEvent["roleId"],
    title: string,
    summary: string
  ): Promise<void> {
    const sequence = (await this.options.runStore.listEvents(run.id)).length + 1;
    const event: AgentRunEvent = {
      schemaVersion: 1,
      id: `agent-event-${run.id}-${sequence}`,
      runId: run.id,
      sequence,
      type,
      status: run.status,
      roleId,
      title,
      summary,
      createdAt: this.now()
    };
    await this.options.runStore.appendEvent(event);
    this.options.eventBroker.publish(event);
  }
}

function createPlannerRequest(run: AgentRunRecord, providerPreference: AgentRuntimeMode, revisionFeedback?: readonly string[]): AgentExecutionRequest {
  return {
    runId: run.id, missionId: run.missionId, taskId: run.taskId, kind: "planner", roleId: "product_manager",
    command: run.command, attempt: run.attempt, providerPreference,
    ...(revisionFeedback ? { revisionFeedback } : {})
  };
}

function createVerifierRequest(run: AgentRunRecord, providerPreference: AgentRuntimeMode, plannerOutput: MissionPlanOutput): AgentExecutionRequest {
  return { runId: run.id, missionId: run.missionId, taskId: run.taskId, kind: "verifier", roleId: "lead_ba", command: run.command, attempt: run.attempt, providerPreference, plannerOutput };
}

function requirePlan(result: AgentExecutionResult): MissionPlanOutput {
  if (!isMissionPlanOutput(result.output)) throw new AgentExecutionError("invalid_output", "Planner output failed validation.");
  return result.output;
}

function requireVerification(result: AgentExecutionResult): PlanningVerificationOutput {
  if (!isPlanningVerificationOutput(result.output)) throw new AgentExecutionError("invalid_output", "Verifier output failed validation.");
  return result.output;
}

function normalizeError(error: unknown, timedOut: boolean): { code: AgentRunErrorCode; message: string } {
  if (timedOut) return { code: "timeout", message: "Agent execution exceeded its time limit." };
  if (error instanceof AgentExecutionError) return { code: error.code, message: error.message };
  return { code: "provider_error", message: error instanceof Error ? error.message : "Unknown agent execution error." };
}

function addUsage(a: AgentUsage, b: AgentUsage): AgentUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, durationMs: a.durationMs + b.durationMs };
}

function emptyUsage(): AgentUsage {
  return { inputTokens: 0, outputTokens: 0, durationMs: 0 };
}

function isTerminal(status: AgentRunRecord["status"]): boolean {
  return ["completed", "blocked", "failed", "cancelled"].includes(status);
}

function formatMarkdown(title: string, sections: readonly RuntimeArtifactSection[]): string {
  return [`# ${title}`, "", ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body, "", ...section.evidence.map((item) => `- ${item}`), ""])].join("\n").trim();
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
