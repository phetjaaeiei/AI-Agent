import type {
  AssumptionRecord,
  DepartmentId,
  OperationalMissionPhase,
  QualityGateId,
  RoleId
} from "../../../shared/src/index.js";

export type RuntimeGateStatus = "passed" | "reviewing" | "running" | "queued" | "blocked";

export type RuntimeTaskStatus = "queued" | "running" | "reviewing" | "passed" | "blocked";

export type RuntimeActivityEvent = {
  id: string;
  roleId: RoleId;
  type: "artifact" | "gate" | "tool" | "risk" | "phase";
  title: string;
  summary: string;
  tone: "info" | "success" | "warning" | "danger";
  time: string;
};

export type RuntimeGateRun = {
  gateId: QualityGateId;
  ownerRoleId: RoleId;
  status: RuntimeGateStatus;
  score: number;
  note: string;
  lastUpdated: string;
};

export type RuntimeTaskDefinition = {
  id: string;
  title: string;
  summary: string;
  routeId: string;
  ownerRoleId: RoleId;
  room: DepartmentId;
  phase: OperationalMissionPhase;
  artifactId: string;
  gateId: QualityGateId;
  initialStatus: RuntimeTaskStatus;
  priority: "normal" | "high" | "urgent";
  eta: string;
};

export type RuntimeRouteDefinition = {
  id: string;
  label: string;
  summary: string;
  fromRoleId: RoleId;
  toRoleId: RoleId;
  fromRoom: DepartmentId;
  toRoom: DepartmentId;
  artifactId: string;
  gateId: QualityGateId;
  token: string;
};

export type RuntimeAutopilotAction = Omit<RuntimeActivityEvent, "id"> & {
  gateId: QualityGateId;
  status: RuntimeGateStatus;
  score: number;
  note: string;
};

export type RuntimeState = {
  gateRuns: Record<QualityGateId, RuntimeGateRun>;
  taskRuns: Record<string, RuntimeTaskStatus>;
  activityLog: RuntimeActivityEvent[];
  activeRouteIndex: number;
  autopilotCursor: number;
};

export type RuntimeSelection = {
  selectedGateId: QualityGateId;
  selectedRoleId: RoleId;
  selectedRoomId: DepartmentId;
  selectedArtifactId: string;
};

export type RuntimeTransitionResult = RuntimeState & RuntimeSelection;

export type RuntimeMissionLifecycleStatus = "draft" | "saved" | "running" | "blocked" | "delivered";

export type RuntimeMissionState = {
  status: RuntimeMissionLifecycleStatus;
  title: string;
  source: "local" | "orchestrator" | "agent_runtime" | "mission_controller" | "review_service";
  statusReason: string;
  createdAt: string;
  updatedAt: string;
};

export type RuntimeArtifactRecord = {
  id: string;
  artifactId: string;
  taskId: string;
  title: string;
  summary: string;
  ownerRoleId: RoleId;
  gateId: QualityGateId;
  status: "draft" | "reviewing" | "verified";
  version: number;
  createdAt: string;
};

export type RuntimeArtifactSection = {
  heading: string;
  body: string;
  evidence: readonly string[];
};

export type RuntimeArtifactContent = {
  schemaVersion: 1;
  id: string;
  artifactRecordId: string;
  artifactId: string;
  taskId: string;
  missionId: string;
  title: string;
  summary: string;
  ownerRoleId: RoleId;
  gateId: QualityGateId;
  status: RuntimeArtifactRecord["status"];
  version: number;
  format: "markdown";
  source: "orchestrator" | "local_runtime" | "agent_runtime" | "tool_runner" | "git_runner" | "review_service";
  sections: readonly RuntimeArtifactSection[];
  markdown: string;
  createdAt: string;
  updatedAt: string;
};

export type RuntimeAuditEvent = {
  id: string;
  actorRoleId: RoleId;
  action:
    | "mission_saved"
    | "command_parsed"
    | "task_advanced"
    | "artifact_recorded"
    | "selection_changed"
    | "agent_run_started"
    | "agent_run_completed"
    | "agent_run_failed"
    | "tool_call_started"
    | "tool_call_completed"
    | "tool_call_failed"
    | "git_operation_started"
    | "git_operation_completed"
    | "git_operation_failed"
    | "review_packet_created"
    | "review_packet_updated"
    | "delivery_packet_created"
    | "mission_controller_started"
    | "mission_controller_completed"
    | "mission_controller_stopped";
  summary: string;
  severity: "info" | "success" | "warning" | "danger";
  entityId: string;
  createdAt: string;
};

export type RuntimeSessionSnapshot = {
  schemaVersion: 1;
  missionId: string;
  commandDraft: string;
  assumptionDraft: string;
  missionAssumptions: readonly AssumptionRecord[];
  missionPlan: ParsedMissionCommand;
  missionState: RuntimeMissionState;
  runtime: RuntimeState;
  selection: RuntimeSelection;
  artifactRecords: readonly RuntimeArtifactRecord[];
  auditEvents: readonly RuntimeAuditEvent[];
  savedAt: string;
};

export type RuntimeSessionRestoreResult =
  | {
      ok: true;
      snapshot: RuntimeSessionSnapshot;
      recoveredFrom: "snapshot";
    }
  | {
      ok: false;
      snapshot: RuntimeSessionSnapshot;
      reason: string;
      recoveredFrom: "defaults";
    };

export type RuntimeWorkload = {
  active: number;
  queued: number;
  blocked: number;
  passed: number;
  total: number;
};

export type RuntimeAgentWorkload = {
  active: number;
  queued: number;
  blocked: number;
};

export type ParsedCapability = {
  id: string;
  label: string;
  ownerRoleId: RoleId;
  phase: OperationalMissionPhase;
};

export type ParsedMissionRisk = {
  id: string;
  label: string;
  level: "low" | "medium" | "high";
  ownerRoleId: RoleId;
};

export type ParsedMissionCommand = {
  rawCommand: string;
  title: string;
  summary: string;
  autonomyMode: "autopilot" | "review_first" | "needs_setup";
  confidence: number;
  detectedCapabilities: readonly ParsedCapability[];
  recommendedRoleIds: readonly RoleId[];
  risks: readonly ParsedMissionRisk[];
  missingInputs: readonly string[];
};

export const DEFAULT_MISSION_COMMAND =
  "Build sales analytics dashboard with filters, CSV export, tests, staging deploy";

export const RUNTIME_SESSION_SCHEMA_VERSION = 1;
export const RUNTIME_ARTIFACT_CONTENT_SCHEMA_VERSION = 1;

const capabilityRules: readonly {
  id: string;
  label: string;
  ownerRoleId: RoleId;
  phase: OperationalMissionPhase;
  keywords: readonly string[];
}[] = [
  {
    id: "scope",
    label: "Scope and success criteria",
    ownerRoleId: "product_manager",
    phase: "planning",
    keywords: ["build", "create", "dashboard", "feature", "app", "web"]
  },
  {
    id: "requirements",
    label: "Acceptance criteria",
    ownerRoleId: "lead_ba",
    phase: "discovery",
    keywords: ["requirement", "acceptance", "criteria", "story", "workflow", "filter"]
  },
  {
    id: "interface",
    label: "User interface",
    ownerRoleId: "frontend_developer",
    phase: "implementation",
    keywords: ["ui", "ux", "frontend", "screen", "dashboard", "filter", "table", "csv", "export"]
  },
  {
    id: "api",
    label: "API and data contract",
    ownerRoleId: "backend_developer",
    phase: "implementation",
    keywords: ["api", "backend", "database", "data", "endpoint", "contract"]
  },
  {
    id: "qa",
    label: "Automated and manual checks",
    ownerRoleId: "automation_qa",
    phase: "qa",
    keywords: ["test", "qa", "verify", "browser", "e2e", "smoke"]
  },
  {
    id: "release",
    label: "Staging release",
    ownerRoleId: "devops_lead",
    phase: "release",
    keywords: ["deploy", "staging", "release", "ci", "environment"]
  },
  {
    id: "report",
    label: "Delivery report",
    ownerRoleId: "technical_writer",
    phase: "final_report",
    keywords: ["report", "document", "summary", "handoff", "release note"]
  }
];

export function createTaskRunMap(tasks: readonly RuntimeTaskDefinition[]): Record<string, RuntimeTaskStatus> {
  return Object.fromEntries(tasks.map((task) => [task.id, task.initialStatus]));
}

export function calculateMissionRoomWorkloads(
  tasks: readonly RuntimeTaskDefinition[],
  taskRuns: Record<string, RuntimeTaskStatus>
): Record<DepartmentId, RuntimeWorkload> {
  const workloads: Record<DepartmentId, RuntimeWorkload> = {
    executive: createEmptyWorkload(),
    product: createEmptyWorkload(),
    design: createEmptyWorkload(),
    engineering: createEmptyWorkload(),
    qa: createEmptyWorkload(),
    devops: createEmptyWorkload(),
    operations: createEmptyWorkload()
  };

  for (const task of tasks) {
    const status = taskRuns[task.id] ?? task.initialStatus;
    const workload = workloads[task.room];

    workload.total += 1;

    if (status === "running" || status === "reviewing") {
      workload.active += 1;
    } else if (status === "queued") {
      workload.queued += 1;
    } else if (status === "blocked") {
      workload.blocked += 1;
    } else if (status === "passed") {
      workload.passed += 1;
    }
  }

  return workloads;
}

export function calculateMissionAgentWorkloads(
  tasks: readonly RuntimeTaskDefinition[],
  taskRuns: Record<string, RuntimeTaskStatus>
): Partial<Record<RoleId, RuntimeAgentWorkload>> {
  const workloads: Partial<Record<RoleId, RuntimeAgentWorkload>> = {};

  for (const task of tasks) {
    const status = taskRuns[task.id] ?? task.initialStatus;
    const workload = workloads[task.ownerRoleId] ?? { active: 0, queued: 0, blocked: 0 };

    if (status === "running" || status === "reviewing") {
      workload.active += 1;
    } else if (status === "queued") {
      workload.queued += 1;
    } else if (status === "blocked") {
      workload.blocked += 1;
    }

    workloads[task.ownerRoleId] = workload;
  }

  return workloads;
}

export function parseMissionCommand(command: string): ParsedMissionCommand {
  const rawCommand = command.trim() || DEFAULT_MISSION_COMMAND;
  const normalized = rawCommand.toLowerCase();
  const detectedCapabilities = capabilityRules.filter((rule) =>
    rule.keywords.some((keyword) => normalized.includes(keyword))
  );
  const capabilityFallback = detectedCapabilities.length > 0 ? detectedCapabilities : capabilityRules.slice(0, 4);
  const risks = detectMissionRisks(normalized);
  const missingInputs = detectMissingInputs(normalized);
  const recommendedRoleIds = uniqueRoleIds([
    "ceo",
    "product_manager",
    "lead_ba",
    "tech_lead",
    ...capabilityFallback.map((capability) => capability.ownerRoleId),
    ...(risks.length > 0 ? risks.map((risk) => risk.ownerRoleId) : []),
    "technical_writer"
  ]);
  const confidence = Math.max(48, Math.min(94, 58 + capabilityFallback.length * 6 - missingInputs.length * 4));

  return {
    rawCommand,
    title: createMissionTitle(rawCommand),
    summary: createMissionSummary(capabilityFallback, risks, missingInputs),
    autonomyMode: missingInputs.length >= 3 ? "needs_setup" : risks.some((risk) => risk.level === "high") ? "review_first" : "autopilot",
    confidence,
    detectedCapabilities: capabilityFallback,
    recommendedRoleIds,
    risks,
    missingInputs
  };
}

export function advanceMissionRuntime(
  state: RuntimeState,
  config: {
    routes: readonly RuntimeRouteDefinition[];
    tasks: readonly RuntimeTaskDefinition[];
    actions: readonly RuntimeAutopilotAction[];
  }
): RuntimeTransitionResult {
  const route = config.routes[state.activeRouteIndex] ?? config.routes[0];
  const task = config.tasks[state.activeRouteIndex] ?? config.tasks[0];
  const action = config.actions[state.autopilotCursor % config.actions.length];

  if (!route || !task || !action) {
    throw new Error("Mission runtime requires at least one route, task, and autopilot action.");
  }

  const nextIndex = (state.activeRouteIndex + 1) % config.routes.length;
  const nextTask = config.tasks[nextIndex] ?? config.tasks[0]!;
  const previousGateRun = state.gateRuns[route.gateId];
  const nextGateRun: RuntimeGateRun = {
    ...(previousGateRun ?? {
      gateId: route.gateId,
      ownerRoleId: route.toRoleId,
      status: "queued",
      score: 0,
      note: "Runtime gate was created from the active handoff.",
      lastUpdated: action.time
    }),
    ownerRoleId: route.toRoleId,
    status: action.status,
    score: action.score,
    note: action.note,
    lastUpdated: action.time
  };

  return {
    gateRuns: {
      ...state.gateRuns,
      [route.gateId]: nextGateRun
    },
    taskRuns: {
      ...state.taskRuns,
      [task.id]: "passed",
      [nextTask.id]: nextTask.initialStatus === "blocked" ? "blocked" : "running"
    },
    activityLog: [
      {
        id: `evt-auto-${state.autopilotCursor + 1}`,
        roleId: route.toRoleId,
        type: action.type,
        title: action.title,
        summary: `${route.label}: ${action.summary}`,
        tone: action.tone,
        time: action.time
      },
      ...state.activityLog
    ],
    activeRouteIndex: nextIndex,
    autopilotCursor: state.autopilotCursor + 1,
    selectedGateId: route.gateId,
    selectedRoleId: route.toRoleId,
    selectedRoomId: route.toRoom,
    selectedArtifactId: route.artifactId
  };
}

export function createRuntimeArtifactRecord(input: {
  artifactId: string;
  taskId: string;
  title: string;
  summary: string;
  ownerRoleId: RoleId;
  gateId: QualityGateId;
  status: RuntimeArtifactRecord["status"];
  version: number;
  createdAt: string;
}): RuntimeArtifactRecord {
  return {
    id: `artifact-record-${input.artifactId}-v${input.version}`,
    artifactId: input.artifactId,
    taskId: input.taskId,
    title: input.title,
    summary: input.summary,
    ownerRoleId: input.ownerRoleId,
    gateId: input.gateId,
    status: input.status,
    version: input.version,
    createdAt: input.createdAt
  };
}

export function createRuntimeArtifactContent(input: {
  missionId: string;
  artifactRecord: RuntimeArtifactRecord;
  missionPlan: ParsedMissionCommand;
  route: RuntimeRouteDefinition;
  task: RuntimeTaskDefinition;
  createdAt: string;
  source: RuntimeArtifactContent["source"];
}): RuntimeArtifactContent {
  const capabilityEvidence =
    input.missionPlan.detectedCapabilities.length > 0
      ? input.missionPlan.detectedCapabilities.map((capability) => capability.label)
      : ["No capability labels detected"];
  const riskEvidence =
    input.missionPlan.risks.length > 0
      ? input.missionPlan.risks.map((risk) => `${risk.label} (${risk.level})`)
      : ["No high-risk signals detected"];
  const missingEvidence =
    input.missionPlan.missingInputs.length > 0 ? input.missionPlan.missingInputs : ["No missing setup inputs"];
  const sections: RuntimeArtifactSection[] = [
    {
      heading: "Mission",
      body: `${input.missionPlan.title}. ${input.missionPlan.summary}`,
      evidence: [`Autonomy: ${input.missionPlan.autonomyMode}`, `Confidence: ${input.missionPlan.confidence}%`]
    },
    {
      heading: "Handoff",
      body: `${input.route.label}. ${input.route.summary}`,
      evidence: [`From: ${input.route.fromRoleId}`, `To: ${input.route.toRoleId}`, `Gate: ${input.route.gateId}`]
    },
    {
      heading: "Task Evidence",
      body: `${input.task.title}. ${input.task.summary}`,
      evidence: [`Priority: ${input.task.priority}`, `ETA: ${input.task.eta}`, `Status: ${input.artifactRecord.status}`]
    },
    {
      heading: "Capability Coverage",
      body: "Detected work signals are mapped into reviewable evidence before the next role takes over.",
      evidence: capabilityEvidence
    },
    {
      heading: "Risk And Inputs",
      body: "The artifact records open risks and missing inputs so reviewer agents know what to challenge.",
      evidence: [...riskEvidence, ...missingEvidence]
    }
  ];

  return {
    schemaVersion: RUNTIME_ARTIFACT_CONTENT_SCHEMA_VERSION,
    id: `artifact-content-${input.artifactRecord.artifactId}-v${input.artifactRecord.version}`,
    artifactRecordId: input.artifactRecord.id,
    artifactId: input.artifactRecord.artifactId,
    taskId: input.artifactRecord.taskId,
    missionId: input.missionId,
    title: input.artifactRecord.title,
    summary: input.artifactRecord.summary,
    ownerRoleId: input.artifactRecord.ownerRoleId,
    gateId: input.artifactRecord.gateId,
    status: input.artifactRecord.status,
    version: input.artifactRecord.version,
    format: "markdown",
    source: input.source,
    sections,
    markdown: formatArtifactMarkdown(input.artifactRecord.title, sections),
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
}

export function createRuntimeAuditEvent(input: {
  id: string;
  actorRoleId: RoleId;
  action: RuntimeAuditEvent["action"];
  summary: string;
  severity: RuntimeAuditEvent["severity"];
  entityId: string;
  createdAt: string;
}): RuntimeAuditEvent {
  return {
    id: input.id,
    actorRoleId: input.actorRoleId,
    action: input.action,
    summary: input.summary,
    severity: input.severity,
    entityId: input.entityId,
    createdAt: input.createdAt
  };
}

export function createRuntimeMissionState(input: {
  commandDraft: string;
  missionPlan: ParsedMissionCommand;
  savedAt: string;
  previousState?: RuntimeMissionState;
  source?: RuntimeMissionState["source"];
  status?: RuntimeMissionLifecycleStatus;
  statusReason?: string;
}): RuntimeMissionState {
  const status = input.status ?? input.previousState?.status ?? "saved";

  return {
    status,
    title: input.missionPlan.title || createMissionTitle(input.commandDraft),
    source: input.source ?? input.previousState?.source ?? "local",
    statusReason: input.statusReason ?? input.previousState?.statusReason ?? defaultMissionStateReason(status),
    createdAt: input.previousState?.createdAt ?? input.savedAt,
    updatedAt: input.savedAt
  };
}

export function restoreRuntimeArtifactContents(candidate: unknown): RuntimeArtifactContent[] {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter(isRuntimeArtifactContent);
}

export function createRuntimeSessionSnapshot(input: {
  missionId: string;
  commandDraft: string;
  assumptionDraft?: string;
  missionAssumptions?: readonly AssumptionRecord[];
  missionPlan: ParsedMissionCommand;
  missionState?: RuntimeMissionState;
  runtime: RuntimeState;
  selection: RuntimeSelection;
  artifactRecords: readonly RuntimeArtifactRecord[];
  auditEvents: readonly RuntimeAuditEvent[];
  savedAt: string;
}): RuntimeSessionSnapshot {
  const missionStateInput = input.missionState
    ? {
        previousState: input.missionState,
        source: input.missionState.source,
        status: input.missionState.status,
        statusReason: input.missionState.statusReason
      }
    : {};

  return {
    schemaVersion: RUNTIME_SESSION_SCHEMA_VERSION,
    missionId: input.missionId,
    commandDraft: input.commandDraft,
    assumptionDraft: input.assumptionDraft ?? input.missionAssumptions?.map((record) => record.assumption).join("\n") ?? "",
    missionAssumptions: input.missionAssumptions ?? [],
    missionPlan: input.missionPlan,
    missionState: createRuntimeMissionState({
      commandDraft: input.commandDraft,
      missionPlan: input.missionPlan,
      savedAt: input.savedAt,
      ...missionStateInput
    }),
    runtime: input.runtime,
    selection: input.selection,
    artifactRecords: input.artifactRecords,
    auditEvents: input.auditEvents,
    savedAt: input.savedAt
  };
}

export function restoreRuntimeSessionSnapshot(
  candidate: unknown,
  defaults: RuntimeSessionSnapshot
): RuntimeSessionRestoreResult {
  if (!isRuntimeSessionSnapshot(candidate)) {
    return {
      ok: false,
      snapshot: defaults,
      reason: "Stored mission session is missing required fields.",
      recoveredFrom: "defaults"
    };
  }

  if (candidate.schemaVersion !== RUNTIME_SESSION_SCHEMA_VERSION) {
    return {
      ok: false,
      snapshot: defaults,
      reason: `Stored mission session schema ${candidate.schemaVersion} is not supported.`,
      recoveredFrom: "defaults"
    };
  }

  const snapshot = candidate as RuntimeSessionSnapshot;
  const missionStateInput = isRuntimeMissionState(snapshot.missionState) ? { missionState: snapshot.missionState } : {};
  const missionAssumptions = Array.isArray(snapshot.missionAssumptions)
    ? snapshot.missionAssumptions.filter(isAssumptionRecord)
    : [];
  const restoredSnapshot = createRuntimeSessionSnapshot({
    missionId: snapshot.missionId,
    commandDraft: snapshot.commandDraft,
    assumptionDraft: typeof snapshot.assumptionDraft === "string"
      ? snapshot.assumptionDraft
      : missionAssumptions.map((record) => record.assumption).join("\n"),
    missionAssumptions,
    missionPlan: snapshot.missionPlan,
    ...missionStateInput,
    runtime: snapshot.runtime,
    selection: snapshot.selection,
    artifactRecords: snapshot.artifactRecords,
    auditEvents: snapshot.auditEvents,
    savedAt: snapshot.savedAt
  });

  return {
    ok: true,
    snapshot: restoredSnapshot,
    recoveredFrom: "snapshot"
  };
}

function createEmptyWorkload(): RuntimeWorkload {
  return { active: 0, queued: 0, blocked: 0, passed: 0, total: 0 };
}

function defaultMissionStateReason(status: RuntimeMissionLifecycleStatus): string {
  if (status === "draft") return "Mission command has local draft edits.";
  if (status === "running") return "Mission controller is executing the current intake.";
  if (status === "blocked") return "Mission needs review before it can continue.";
  if (status === "delivered") return "Mission delivery evidence is ready.";
  return "Mission intake is saved and ready for local execution.";
}

function detectMissionRisks(normalizedCommand: string): ParsedMissionRisk[] {
  const risks: ParsedMissionRisk[] = [];

  if (normalizedCommand.includes("production") || normalizedCommand.includes("prod")) {
    risks.push({
      id: "production-approval",
      label: "Production deploy requires explicit approval",
      level: "high",
      ownerRoleId: "release_manager"
    });
  }

  if (normalizedCommand.includes("payment") || normalizedCommand.includes("personal data") || normalizedCommand.includes("security")) {
    risks.push({
      id: "security-review",
      label: "Security and compliance review required",
      level: "high",
      ownerRoleId: "security_engineer"
    });
  }

  if (!normalizedCommand.includes("test") && !normalizedCommand.includes("qa")) {
    risks.push({
      id: "missing-test-signal",
      label: "Testing scope is not explicit",
      level: "medium",
      ownerRoleId: "qa_lead"
    });
  }

  return risks;
}

function detectMissingInputs(normalizedCommand: string): string[] {
  const missingInputs: string[] = [];

  if (!["repo", "repository", "github", "file", "codebase"].some((keyword) => normalizedCommand.includes(keyword))) {
    missingInputs.push("target repository or codebase");
  }

  if (!["staging", "dev", "uat", "production", "environment"].some((keyword) => normalizedCommand.includes(keyword))) {
    missingInputs.push("target environment");
  }

  if (!["success", "criteria", "acceptance", "metric"].some((keyword) => normalizedCommand.includes(keyword))) {
    missingInputs.push("success criteria");
  }

  return missingInputs;
}

function createMissionTitle(command: string): string {
  const firstClause = command.split(/[.!?\n]/)[0]?.trim() ?? DEFAULT_MISSION_COMMAND;
  const compact = firstClause.replace(/\s+/g, " ");

  if (compact.length <= 72) {
    return compact;
  }

  return `${compact.slice(0, 69).trim()}...`;
}

function createMissionSummary(
  capabilities: readonly ParsedCapability[],
  risks: readonly ParsedMissionRisk[],
  missingInputs: readonly string[]
): string {
  const capabilityText = capabilities.map((capability) => capability.label).join(", ");
  const riskText = risks.length > 0 ? `${risks.length} ${pluralize("risk check", risks.length)}` : "No high-risk signals";
  const setupText =
    missingInputs.length > 0 ? `${missingInputs.length} ${pluralize("setup input", missingInputs.length)} missing` : "ready to run";

  return `${capabilityText}. ${riskText}; ${setupText}.`;
}

function uniqueRoleIds(roleIds: readonly RoleId[]): RoleId[] {
  return [...new Set(roleIds)];
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

function isRuntimeSessionSnapshot(value: unknown): value is RuntimeSessionSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<RuntimeSessionSnapshot>;

  return (
    snapshot.schemaVersion === RUNTIME_SESSION_SCHEMA_VERSION &&
    typeof snapshot.missionId === "string" &&
    typeof snapshot.commandDraft === "string" &&
    (snapshot.assumptionDraft === undefined || typeof snapshot.assumptionDraft === "string") &&
    (snapshot.missionAssumptions === undefined || Array.isArray(snapshot.missionAssumptions)) &&
    typeof snapshot.savedAt === "string" &&
    Boolean(snapshot.missionPlan) &&
    (snapshot.missionState === undefined || isRuntimeMissionState(snapshot.missionState)) &&
    Boolean(snapshot.runtime) &&
    Boolean(snapshot.selection) &&
    Array.isArray(snapshot.artifactRecords) &&
    Array.isArray(snapshot.auditEvents)
  );
}

function isAssumptionRecord(value: unknown): value is AssumptionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const assumption = value as Partial<AssumptionRecord>;

  return (
    typeof assumption.id === "string" &&
    typeof assumption.missionId === "string" &&
    typeof assumption.assumption === "string" &&
    typeof assumption.source === "string" &&
    (
      assumption.ambiguityClass === "low" ||
      assumption.ambiguityClass === "medium" ||
      assumption.ambiguityClass === "high" ||
      assumption.ambiguityClass === "critical"
    ) &&
    typeof assumption.confidence === "number" &&
    typeof assumption.impact === "string" &&
    typeof assumption.ownerRoleId === "string" &&
    (
      assumption.reviewStatus === "open" ||
      assumption.reviewStatus === "reviewed" ||
      assumption.reviewStatus === "accepted" ||
      assumption.reviewStatus === "rejected" ||
      assumption.reviewStatus === "expired"
    ) &&
    typeof assumption.createdAt === "string"
  );
}

function isRuntimeMissionState(value: unknown): value is RuntimeMissionState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<RuntimeMissionState>;

  return (
    (
      state.status === "draft" ||
      state.status === "saved" ||
      state.status === "running" ||
      state.status === "blocked" ||
      state.status === "delivered"
    ) &&
    typeof state.title === "string" &&
    (
      state.source === "local" ||
      state.source === "orchestrator" ||
      state.source === "agent_runtime" ||
      state.source === "mission_controller" ||
      state.source === "review_service"
    ) &&
    typeof state.statusReason === "string" &&
    typeof state.createdAt === "string" &&
    typeof state.updatedAt === "string"
  );
}

function isRuntimeArtifactContent(value: unknown): value is RuntimeArtifactContent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const content = value as Partial<RuntimeArtifactContent>;

  return (
    content.schemaVersion === RUNTIME_ARTIFACT_CONTENT_SCHEMA_VERSION &&
    typeof content.id === "string" &&
    typeof content.artifactRecordId === "string" &&
    typeof content.artifactId === "string" &&
    typeof content.taskId === "string" &&
    typeof content.missionId === "string" &&
    typeof content.title === "string" &&
    typeof content.summary === "string" &&
    typeof content.ownerRoleId === "string" &&
    typeof content.gateId === "string" &&
    typeof content.version === "number" &&
    content.format === "markdown" &&
    (
      content.source === "orchestrator" ||
      content.source === "local_runtime" ||
      content.source === "agent_runtime" ||
      content.source === "tool_runner" ||
      content.source === "git_runner" ||
      content.source === "review_service"
    ) &&
    Array.isArray(content.sections) &&
    typeof content.markdown === "string" &&
    typeof content.createdAt === "string" &&
    typeof content.updatedAt === "string"
  );
}

function formatArtifactMarkdown(title: string, sections: readonly RuntimeArtifactSection[]): string {
  const lines = [`# ${title}`, ""];

  for (const section of sections) {
    lines.push(`## ${section.heading}`, "", section.body, "");

    for (const evidence of section.evidence) {
      lines.push(`- ${evidence}`);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}
