import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  Archive,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudCog,
  Code2,
  Command,
  Cpu,
  FileText,
  GitBranch,
  LayoutDashboard,
  RotateCcw,
  Search,
  ShieldCheck,
  Square,
  TestTube2,
  Upload,
  X,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AGENT_MODEL_ROUTING } from "../../../packages/config/src/index.js";
import {
  MISSION_BENCHMARKS,
  PHASE_RACI,
  QUALITY_GATES,
  DEFAULT_MISSION_COMMAND,
  advanceMissionRuntime,
  calculateMissionAgentWorkloads,
  calculateMissionRoomWorkloads,
  calculateAccuracyScore,
  createAssumptionsFromDraft,
  createRuntimeArtifactContent,
  createRuntimeArtifactRecord,
  createRuntimeAuditEvent,
  createRuntimeMissionState,
  createRuntimeSessionSnapshot,
  createAssumptionRecord,
  formatAssumptionDraft,
  parseMissionCommand,
  restoreRuntimeSessionSnapshot
} from "../../../packages/workflow/src/index.js";
import type {
  RuntimeArtifactContent,
  RuntimeArtifactRecord,
  RuntimeAuditEvent,
  MissionHistoryRecord,
  MissionHistorySummary,
  RuntimeMissionState,
  RuntimeSessionSnapshot
} from "../../../packages/workflow/src/index.js";
import type {
  AgentRunEvent,
  AgentRunRecord,
  AgentRuntimeInfo,
  AssumptionRecord,
  AutomationEvidenceContext,
  AutomationPolicySnapshot,
  ArtifactStatus,
  ArtifactType,
  DepartmentId,
  GitOperationRecord,
  GitOperationRequest,
  GitPolicySnapshot,
  MissionControllerRecord,
  MissionControllerStage,
  OperationalMissionPhase,
  QualityGateId,
  ReviewPacket,
  RoleId,
  ToolCallRecord,
  ToolCallRequest,
  ToolPolicySnapshot
} from "../../../packages/shared/src/index.js";
import { createDefaultAutomationPolicySnapshot } from "../../../packages/shared/src/index.js";
import {
  cancelAgentRun,
  cancelMissionController,
  createDeliveryPacket,
  createReviewPacket,
  fetchAgentRun,
  fetchAgentRuns,
  fetchAgentRuntimeInfo,
  fetchAutomationPolicy,
  fetchGitOperations,
  fetchGitPolicy,
  fetchMissionController,
  fetchMissionControllers,
  fetchMissionHistory,
  fetchMissionHistoryRecord,
  fetchOrchestratorArtifacts,
  fetchOrchestratorSession,
  fetchReviewPackets,
  fetchToolCalls,
  fetchToolPolicy,
  recordReviewDecision,
  refreshReviewPacket,
  retryAgentRun,
  retryMissionController,
  runReviewPacketCi,
  saveOrchestratorSession,
  startGitOperation,
  startMissionController,
  startToolCall,
  subscribeToAgentRun
} from "./orchestrator-client.js";
import type { OrchestratorConnectionStatus } from "./orchestrator-client.js";
import { WarRoomSignalPanel } from "./components/concept/WarRoomSignalPanel.js";
import type { WarRoomSignal } from "./components/concept/WarRoomSignalPanel.js";
import { LeftNav } from "./components/layout/LeftNav.js";
import { AutomationDecisionSummary } from "./components/mission/AutomationDecisionSummary.js";
import { AutomationPolicyCard } from "./components/mission/AutomationPolicyCard.js";
import { BottomDock } from "./components/mission/BottomDock.js";
import type { ActivityEvent, ActivityFilter } from "./components/mission/BottomDock.js";
import { ArtifactMemoryCard } from "./components/mission/ArtifactMemoryCard.js";
import { CommandOutputSummaryCard } from "./components/mission/CommandOutputSummaryCard.js";
import type { CommandOutputSummary } from "./components/mission/CommandOutputSummaryCard.js";
import { EvidenceInspectorCard } from "./components/mission/EvidenceInspectorCard.js";
import type { EvidenceSourceFilter, EvidenceStatusFilter } from "./components/mission/EvidenceInspectorCard.js";
import { MissionHistoryPanel } from "./components/mission/MissionHistoryPanel.js";
import { MissionIntakePanel } from "./components/mission/MissionIntakePanel.js";
import { MissionRecoveryInspector } from "./components/mission/MissionRecoveryInspector.js";
import { OllamaLearningCard } from "./components/mission/OllamaLearningCard.js";
import { RemoteHandoffExecutionCard } from "./components/mission/RemoteHandoffExecutionCard.js";
import type { OllamaLearningCandidate } from "./components/mission/OllamaLearningCard.js";
import { TaskGraphCard } from "./components/mission/TaskGraphCard.js";
import { TopHud } from "./components/mission/TopHud.js";
import { HardeningGuidanceList } from "./components/primitives/HardeningGuidanceList.js";
import type { HardeningGuidance } from "./components/primitives/HardeningGuidanceList.js";
import { isRealArtifactContent, isSeededArtifactContent } from "./utils/artifact-content.js";
import { missionStateLabel } from "./utils/mission-labels.js";
import { gitOperationKindLabel, gitOperationSummary, toolCallKindLabel } from "./utils/operation-labels.js";
import { createRemoteHandoffSignalSummary } from "./utils/remote-handoff.js";
import {
  findRoleByDepartment,
  getRoleDefinition as roleDefinition,
  getRoleName as roleName,
  getShortRoleName as shortRoleName
} from "./utils/role-labels.js";
import { formatHistoryTimestamp, formatSavedAt } from "./utils/time-format.js";

type ActiveRole = {
  roleId: RoleId;
  task: string;
  status: "planning" | "building" | "testing" | "deploying" | "writing";
  room: DepartmentId;
  x: number;
  y: number;
  walkX: number;
  walkY: number;
  walkDuration: number;
  walkDelay: number;
};

type GateStatus = "passed" | "reviewing" | "running" | "queued" | "blocked";

type GateRun = {
  gateId: QualityGateId;
  ownerRoleId: RoleId;
  status: GateStatus;
  score: number;
  note: string;
  lastUpdated: string;
};

type TaskRunStatus = "queued" | "running" | "reviewing" | "passed" | "blocked";

type MissionTask = {
  id: string;
  title: string;
  summary: string;
  routeId: string;
  ownerRoleId: RoleId;
  room: DepartmentId;
  phase: OperationalMissionPhase;
  artifactId: string;
  gateId: QualityGateId;
  initialStatus: TaskRunStatus;
  priority: "normal" | "high" | "urgent";
  eta: string;
};

type RoomWorkload = {
  active: number;
  queued: number;
  blocked: number;
  passed: number;
  total: number;
};

type AgentWorkload = {
  active: number;
  queued: number;
  blocked: number;
};

type ArtifactEvidence = {
  id: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  ownerRoleId: RoleId;
  phase: OperationalMissionPhase;
  summary: string;
  evidence: readonly string[];
};

type AutopilotAction = Omit<ActivityEvent, "id"> & {
  gateId: QualityGateId;
  status: GateStatus;
  score: number;
  note: string;
};

type WorkflowRoute = {
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
  start: { x: number; y: number };
  mid: { x: number; y: number };
  end: { x: number; y: number };
};

type MapTile = {
  id: string;
  tone: "work" | "corridor" | "wall" | "entry" | "utility";
};

type AgentSpriteStyle = CSSProperties &
  Record<"--walk-x" | "--walk-y" | "--walk-duration" | "--walk-delay", string>;

type WorkflowRunnerStyle = CSSProperties &
  Record<
    | "--route-start-x"
    | "--route-start-y"
    | "--route-mid-x"
    | "--route-mid-y"
    | "--route-end-x"
    | "--route-end-y",
    string
  >;

const activeMission = MISSION_BENCHMARKS.find((mission) => mission.id === "bench_multi_role_full_feature")!;

const accuracy = calculateAccuracyScore({
  completeness: 90,
  correctness: 87,
  consistency: 89,
  verifiability: 86,
  riskControl: 88
});

const activeRoles: ActiveRole[] = [
  { roleId: "ceo", task: "Confirm success criteria", status: "planning", room: "executive", x: 17, y: 18, walkX: 24, walkY: 8, walkDuration: 9.4, walkDelay: -1.2 },
  { roleId: "product_manager", task: "Lock dashboard scope", status: "planning", room: "product", x: 35, y: 25, walkX: 28, walkY: 12, walkDuration: 8.8, walkDelay: -3.1 },
  { roleId: "lead_ba", task: "Map acceptance matrix", status: "planning", room: "product", x: 45, y: 36, walkX: -22, walkY: -10, walkDuration: 10.2, walkDelay: -0.6 },
  { roleId: "tech_lead", task: "Review implementation path", status: "building", room: "engineering", x: 55, y: 25, walkX: 42, walkY: 18, walkDuration: 7.8, walkDelay: -2.4 },
  { roleId: "frontend_developer", task: "Build filters and table", status: "building", room: "engineering", x: 64, y: 35, walkX: 34, walkY: -12, walkDuration: 8.6, walkDelay: -4.5 },
  { roleId: "backend_developer", task: "Check API contract", status: "building", room: "engineering", x: 76, y: 28, walkX: -36, walkY: 16, walkDuration: 9.2, walkDelay: -1.9 },
  { roleId: "automation_qa", task: "Prepare export tests", status: "testing", room: "qa", x: 40, y: 63, walkX: -34, walkY: 20, walkDuration: 8.4, walkDelay: -0.8 },
  { roleId: "manual_qa", task: "Review user flow", status: "testing", room: "qa", x: 21, y: 74, walkX: 44, walkY: -18, walkDuration: 9.6, walkDelay: -3.8 },
  { roleId: "devops_lead", task: "Stage deployment plan", status: "deploying", room: "devops", x: 68, y: 68, walkX: 30, walkY: -24, walkDuration: 8.2, walkDelay: -2.7 },
  { roleId: "technical_writer", task: "Draft delivery report", status: "writing", room: "operations", x: 84, y: 48, walkX: -18, walkY: 42, walkDuration: 10.6, walkDelay: -5.1 }
];

const initialActivityEvents: ActivityEvent[] = [
  {
    id: "evt-1",
    roleId: "lead_ba",
    type: "artifact",
    title: "Acceptance matrix created",
    summary: "Filters, export CSV, API contract, and staging smoke checks mapped to evidence.",
    tone: "success",
    time: "10:42"
  },
  {
    id: "evt-2",
    roleId: "tech_lead",
    type: "gate",
    title: "Technical gate in review",
    summary: "Affected modules and test strategy scored against architecture criteria.",
    tone: "info",
    time: "10:45"
  },
  {
    id: "evt-3",
    roleId: "automation_qa",
    type: "tool",
    title: "Test scaffold queued",
    summary: "Automation QA has local write access for test files only.",
    tone: "warning",
    time: "10:49"
  },
  {
    id: "evt-4",
    roleId: "devops_lead",
    type: "risk",
    title: "Production deploy blocked",
    summary: "Routing policy allows staging only until production policy is configured.",
    tone: "danger",
    time: "10:51"
  }
];

const artifactEvidence: ArtifactEvidence[] = [
  {
    id: "art-prd",
    title: "PRD Draft",
    type: "prd",
    status: "reviewing",
    ownerRoleId: "product_manager",
    phase: "planning",
    summary: "Scope, success metrics, and out-of-scope decisions for the sales analytics mission.",
    evidence: ["Mission brief", "Acceptance criteria", "Risk register"]
  },
  {
    id: "art-acceptance",
    title: "Acceptance Matrix",
    type: "user_story",
    status: "verified",
    ownerRoleId: "lead_ba",
    phase: "planning",
    summary: "Traceability from user request to filters, CSV export, QA scenarios, and staging smoke checks.",
    evidence: ["User stories", "Scenario map", "Assumption log"]
  },
  {
    id: "art-technical-plan",
    title: "Technical Plan",
    type: "technical_design",
    status: "reviewing",
    ownerRoleId: "tech_lead",
    phase: "architecture",
    summary: "Module boundaries, API contract check, state model, test strategy, and rollback path.",
    evidence: ["Architecture notes", "API checklist", "Implementation gate criteria"]
  },
  {
    id: "art-qa-report",
    title: "QA Report",
    type: "qa_report",
    status: "draft",
    ownerRoleId: "qa_lead",
    phase: "qa",
    summary: "Manual and automated coverage plan for filters, empty states, export, accessibility, and smoke testing.",
    evidence: ["Automation queue", "Manual test charter", "Browser checks"]
  },
  {
    id: "art-deploy-log",
    title: "Deployment Log",
    type: "deployment_log",
    status: "draft",
    ownerRoleId: "devops_lead",
    phase: "release",
    summary: "Staging deployment target, environment assumptions, smoke check, and rollback readiness.",
    evidence: ["CI status", "Staging deploy plan", "Rollback checklist"]
  }
];

const departmentMeta: Record<DepartmentId, { title: string; icon: LucideIcon; status: string; tone: string }> = {
  executive: { title: "Executive", icon: Building2, status: "Strategy", tone: "amber" },
  product: { title: "Product", icon: ClipboardCheck, status: "Planning", tone: "amber" },
  design: { title: "Design", icon: LayoutDashboard, status: "Ready", tone: "blue" },
  engineering: { title: "Engineering", icon: Code2, status: "Building", tone: "blue" },
  qa: { title: "QA Lab", icon: TestTube2, status: "Testing", tone: "green" },
  devops: { title: "DevOps", icon: CloudCog, status: "Staging", tone: "red" },
  operations: { title: "Operations", icon: Archive, status: "Reporting", tone: "green" }
};

const phaseVisuals = [
  { phase: "planning", label: "Planning", short: "Plan", gateId: "planning_gate" },
  { phase: "architecture", label: "Technical Design", short: "Design", gateId: "technical_design_gate" },
  { phase: "implementation", label: "Building", short: "Build", gateId: "implementation_gate" },
  { phase: "qa", label: "Testing", short: "QA", gateId: "qa_gate" },
  { phase: "release", label: "Deploying", short: "Ship", gateId: "release_gate" },
  { phase: "final_report", label: "Final Report", short: "Report", gateId: "final_report_gate" }
] as const satisfies readonly {
  phase: OperationalMissionPhase;
  label: string;
  short: string;
  gateId: QualityGateId;
}[];

const roomPlacements: Record<DepartmentId, { x: number; y: number; w: number; h: number }> = {
  executive: { x: 6, y: 8, w: 26, h: 27 },
  product: { x: 33, y: 8, w: 27, h: 35 },
  design: { x: 61, y: 8, w: 31, h: 28 },
  engineering: { x: 46, y: 23, w: 46, h: 30 },
  qa: { x: 10, y: 52, w: 36, h: 32 },
  devops: { x: 48, y: 56, w: 27, h: 29 },
  operations: { x: 76, y: 42, w: 18, h: 42 }
};

const workflowRoutes: WorkflowRoute[] = [
  {
    id: "route-acceptance-to-tech",
    label: "Acceptance matrix handoff",
    summary: "Lead BA sends acceptance evidence to Tech Lead before implementation review.",
    fromRoleId: "lead_ba",
    toRoleId: "tech_lead",
    fromRoom: "product",
    toRoom: "engineering",
    artifactId: "art-acceptance",
    gateId: "technical_design_gate",
    token: "AC",
    start: { x: 43, y: 39 },
    mid: { x: 47, y: 49 },
    end: { x: 55, y: 30 }
  },
  {
    id: "route-tech-to-frontend",
    label: "Build task dispatch",
    summary: "Tech Lead routes the technical plan to Frontend Developer for UI implementation.",
    fromRoleId: "tech_lead",
    toRoleId: "frontend_developer",
    fromRoom: "engineering",
    toRoom: "engineering",
    artifactId: "art-technical-plan",
    gateId: "implementation_gate",
    token: "UI",
    start: { x: 55, y: 30 },
    mid: { x: 59, y: 38 },
    end: { x: 64, y: 39 }
  },
  {
    id: "route-frontend-to-qa",
    label: "Implementation evidence to QA",
    summary: "Frontend Developer sends build evidence to Automation QA for browser and export checks.",
    fromRoleId: "frontend_developer",
    toRoleId: "automation_qa",
    fromRoom: "engineering",
    toRoom: "qa",
    artifactId: "art-qa-report",
    gateId: "qa_gate",
    token: "QA",
    start: { x: 64, y: 39 },
    mid: { x: 51, y: 54 },
    end: { x: 39, y: 67 }
  },
  {
    id: "route-qa-to-devops",
    label: "QA result to staging",
    summary: "Automation QA passes test results to DevOps Lead for staging deployment review.",
    fromRoleId: "automation_qa",
    toRoleId: "devops_lead",
    fromRoom: "qa",
    toRoom: "devops",
    artifactId: "art-deploy-log",
    gateId: "release_gate",
    token: "STG",
    start: { x: 39, y: 67 },
    mid: { x: 50, y: 61 },
    end: { x: 68, y: 70 }
  },
  {
    id: "route-devops-to-writer",
    label: "Deployment log to report",
    summary: "DevOps Lead sends staging evidence to Technical Writer for the delivery report.",
    fromRoleId: "devops_lead",
    toRoleId: "technical_writer",
    fromRoom: "devops",
    toRoom: "operations",
    artifactId: "art-deploy-log",
    gateId: "final_report_gate",
    token: "LOG",
    start: { x: 68, y: 70 },
    mid: { x: 75, y: 58 },
    end: { x: 84, y: 52 }
  },
  {
    id: "route-writer-to-ceo",
    label: "Final report approval",
    summary: "Technical Writer sends the final report package to CEO for executive sign-off.",
    fromRoleId: "technical_writer",
    toRoleId: "ceo",
    fromRoom: "operations",
    toRoom: "executive",
    artifactId: "art-prd",
    gateId: "final_report_gate",
    token: "OK",
    start: { x: 84, y: 52 },
    mid: { x: 45, y: 50 },
    end: { x: 18, y: 22 }
  }
];

const missionTasks: MissionTask[] = [
  {
    id: "task-acceptance-handoff",
    title: "Send acceptance matrix",
    summary: "Lead BA sends measurable acceptance criteria to Tech Lead.",
    routeId: "route-acceptance-to-tech",
    ownerRoleId: "lead_ba",
    room: "product",
    phase: "architecture",
    artifactId: "art-acceptance",
    gateId: "technical_design_gate",
    initialStatus: "running",
    priority: "high",
    eta: "2m"
  },
  {
    id: "task-dispatch-ui-build",
    title: "Dispatch UI build task",
    summary: "Tech Lead hands the technical plan to Frontend Developer.",
    routeId: "route-tech-to-frontend",
    ownerRoleId: "tech_lead",
    room: "engineering",
    phase: "implementation",
    artifactId: "art-technical-plan",
    gateId: "implementation_gate",
    initialStatus: "queued",
    priority: "high",
    eta: "6m"
  },
  {
    id: "task-send-build-evidence",
    title: "Send build evidence",
    summary: "Frontend Developer sends UI implementation evidence to Automation QA.",
    routeId: "route-frontend-to-qa",
    ownerRoleId: "frontend_developer",
    room: "engineering",
    phase: "qa",
    artifactId: "art-qa-report",
    gateId: "qa_gate",
    initialStatus: "queued",
    priority: "high",
    eta: "9m"
  },
  {
    id: "task-qa-to-staging",
    title: "Send QA result to staging",
    summary: "Automation QA sends test evidence to DevOps Lead for staging review.",
    routeId: "route-qa-to-devops",
    ownerRoleId: "automation_qa",
    room: "qa",
    phase: "release",
    artifactId: "art-deploy-log",
    gateId: "release_gate",
    initialStatus: "queued",
    priority: "urgent",
    eta: "5m"
  },
  {
    id: "task-deployment-log-report",
    title: "Attach deployment log",
    summary: "DevOps Lead sends staging evidence to Technical Writer.",
    routeId: "route-devops-to-writer",
    ownerRoleId: "devops_lead",
    room: "devops",
    phase: "final_report",
    artifactId: "art-deploy-log",
    gateId: "final_report_gate",
    initialStatus: "blocked",
    priority: "high",
    eta: "blocked"
  },
  {
    id: "task-executive-signoff",
    title: "Request final sign-off",
    summary: "Technical Writer sends the delivery package to CEO.",
    routeId: "route-writer-to-ceo",
    ownerRoleId: "technical_writer",
    room: "operations",
    phase: "final_report",
    artifactId: "art-prd",
    gateId: "final_report_gate",
    initialStatus: "queued",
    priority: "normal",
    eta: "12m"
  }
];

const initialTaskRuns = Object.fromEntries(
  missionTasks.map((task) => [task.id, task.initialStatus])
) as Record<string, TaskRunStatus>;

const mapTiles: MapTile[] = Array.from({ length: 20 * 12 }, (_, index) => {
  const col = index % 20;
  const row = Math.floor(index / 20);
  const isBorder = col === 0 || col === 19 || row === 0 || row === 11;
  const isMainCorridor = row === 5 || row === 6 || col === 9 || col === 10;
  const isEntry = (row === 5 || row === 6) && [3, 8, 13, 16].includes(col);
  const isUtility = (row === 10 && col >= 12 && col <= 17) || (col === 1 && row >= 8 && row <= 10);

  return {
    id: `tile-${row}-${col}`,
    tone: isBorder ? "wall" : isEntry ? "entry" : isUtility ? "utility" : isMainCorridor ? "corridor" : "work"
  };
});

const roleStatusGate: Record<ActiveRole["status"], QualityGateId> = {
  planning: "planning_gate",
  building: "implementation_gate",
  testing: "qa_gate",
  deploying: "release_gate",
  writing: "final_report_gate"
};

const gateStatusLabel: Record<GateStatus, string> = {
  passed: "Passed",
  reviewing: "Reviewing",
  running: "Running",
  queued: "Queued",
  blocked: "Blocked"
};

const artifactStatusLabel: Record<ArtifactStatus, string> = {
  draft: "Draft",
  reviewing: "Review",
  verified: "Verified",
  rejected: "Rejected",
  superseded: "Superseded"
};

const initialGateRuns: Record<QualityGateId, GateRun> = {
  planning_gate: {
    gateId: "planning_gate",
    ownerRoleId: "cpo",
    status: "passed",
    score: 86,
    note: "Scope, risks, and acceptance criteria are ready for technical design.",
    lastUpdated: "10:38"
  },
  technical_design_gate: {
    gateId: "technical_design_gate",
    ownerRoleId: "tech_lead",
    status: "reviewing",
    score: 82,
    note: "API contract and rollback notes are under architecture review.",
    lastUpdated: "10:45"
  },
  implementation_gate: {
    gateId: "implementation_gate",
    ownerRoleId: "tech_lead",
    status: "running",
    score: 79,
    note: "Frontend and backend agents are mapping work to acceptance criteria.",
    lastUpdated: "10:48"
  },
  qa_gate: {
    gateId: "qa_gate",
    ownerRoleId: "qa_lead",
    status: "queued",
    score: 0,
    note: "QA starts after implementation evidence and test results are attached.",
    lastUpdated: "10:49"
  },
  release_gate: {
    gateId: "release_gate",
    ownerRoleId: "devops_lead",
    status: "blocked",
    score: 52,
    note: "Production deploy remains blocked until staging policy and smoke evidence are present.",
    lastUpdated: "10:51"
  },
  final_report_gate: {
    gateId: "final_report_gate",
    ownerRoleId: "technical_writer",
    status: "queued",
    score: 0,
    note: "Final report waits for QA and deployment evidence.",
    lastUpdated: "10:52"
  }
};

const MISSION_SESSION_STORAGE_KEY = "team-ai-agent:mission-session:v1";
const INITIAL_SESSION_SAVED_AT = "2026-06-18T10:42:00.000Z";
const agentRunStatusLabel: Record<AgentRunRecord["status"], string> = {
  queued: "Queued",
  running: "Planning",
  verifying: "Verifying",
  revising: "Revising",
  completed: "Completed",
  blocked: "Blocked",
  failed: "Failed",
  cancelled: "Cancelled"
};

const toolCallStatusLabel: Record<ToolCallRecord["status"], string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  cancelled: "Cancelled"
};

const gitOperationStatusLabel: Record<GitOperationRecord["status"], string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked"
};

const initialAgentRuntimeInfo: AgentRuntimeInfo = {
  configuredMode: "auto",
  activeProvider: "deterministic",
  ollamaAvailable: false,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  model: "qwen3:8b",
  modelAvailable: false,
  message: "Checking local agent runtime."
};

const initialToolPolicy: ToolPolicySnapshot = {
  schemaVersion: 1,
  workspaceRoot: "local workspace",
  allowedWorkspaceRoots: [],
  allowFileRead: false,
  allowFileWrite: false,
  allowShellCommand: false,
  allowTestCommand: false,
  timeoutMs: 0,
  maxReadBytes: 0,
  maxWriteBytes: 0,
  maxOutputBytes: 0,
  deniedPathPatterns: [],
  allowedCommandPrefixes: []
};

const initialGitPolicy: GitPolicySnapshot = {
  schemaVersion: 1,
  workspaceRoot: "local workspace",
  allowedWorkspaceRoots: [],
  allowGitRead: false,
  allowRemoteRead: false,
  allowGitCommit: false,
  allowRemotePush: false,
  allowPullRequestCreate: false,
  timeoutMs: 0,
  maxDiffBytes: 0,
  deniedPathPatterns: []
};

const initialAutomationPolicy = createDefaultAutomationPolicySnapshot();

function createInitialArtifactRecords(createdAt: string): RuntimeArtifactRecord[] {
  return artifactEvidence.map((artifact, index) => {
    const task = missionTasks.find((item) => item.artifactId === artifact.id) ?? missionTasks[0]!;

    return createRuntimeArtifactRecord({
      artifactId: artifact.id,
      taskId: task.id,
      title: artifact.title,
      summary: artifact.summary,
      ownerRoleId: artifact.ownerRoleId,
      gateId: task.gateId,
      status: artifact.status === "verified" ? "verified" : artifact.status === "reviewing" ? "reviewing" : "draft",
      version: index + 1,
      createdAt
    });
  });
}

function createInitialAuditEvents(createdAt: string): RuntimeAuditEvent[] {
  return [
    createRuntimeAuditEvent({
      id: "audit-session-created",
      actorRoleId: "chief_of_staff",
      action: "mission_saved",
      summary: "Initial mission session snapshot created for local recovery.",
      severity: "info",
      entityId: activeMission.id,
      createdAt
    })
  ];
}

function createInitialMissionAssumptions(createdAt: string): AssumptionRecord[] {
  return [
    createAssumptionRecord({
      missionId: activeMission.id,
      assumption: "Sales API already exposes daily totals and CSV-safe field names.",
      source: "Default mission intake",
      ambiguityClass: "medium",
      confidence: 72,
      impact: "Backend developer must verify API shape before frontend export work finishes.",
      ownerRoleId: "lead_ba",
      createdAt
    })
  ];
}

function createDefaultRuntimeSession(savedAt: string): RuntimeSessionSnapshot {
  const missionPlan = parseMissionCommand(DEFAULT_MISSION_COMMAND);
  const missionAssumptions = createInitialMissionAssumptions(savedAt);

  return createRuntimeSessionSnapshot({
    missionId: activeMission.id,
    commandDraft: DEFAULT_MISSION_COMMAND,
    assumptionDraft: formatAssumptionDraft(missionAssumptions),
    missionAssumptions,
    missionPlan,
    runtime: {
      gateRuns: initialGateRuns,
      taskRuns: initialTaskRuns,
      activityLog: initialActivityEvents,
      activeRouteIndex: 0,
      autopilotCursor: 0
    },
    selection: {
      selectedGateId: "implementation_gate",
      selectedRoleId: "tech_lead",
      selectedRoomId: "engineering",
      selectedArtifactId: "art-technical-plan"
    },
    artifactRecords: createInitialArtifactRecords(savedAt),
    auditEvents: createInitialAuditEvents(savedAt),
    savedAt
  });
}

function loadRuntimeSession(): RuntimeSessionSnapshot {
  const defaults = createDefaultRuntimeSession(INITIAL_SESSION_SAVED_AT);

  if (typeof window === "undefined") {
    return defaults;
  }

  const stored = window.localStorage.getItem(MISSION_SESSION_STORAGE_KEY);

  if (!stored) {
    return defaults;
  }

  try {
    const restore = restoreRuntimeSessionSnapshot(JSON.parse(stored), defaults);

    if (!restore.ok) {
      window.localStorage.removeItem(MISSION_SESSION_STORAGE_KEY);
    }

    return restore.snapshot;
  } catch {
    window.localStorage.removeItem(MISSION_SESSION_STORAGE_KEY);
    return defaults;
  }
}

function saveRuntimeSession(snapshot: RuntimeSessionSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MISSION_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
}

function formatOrchestratorError(error: unknown): string {
  return error instanceof Error ? error.message : "Orchestrator is not reachable.";
}

function formatWorkspaceLabel(workspaceRoot: string): string {
  const parts = workspaceRoot.split("/").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join("/") : workspaceRoot;
}

const artifactSourcePriority: Record<RuntimeArtifactContent["source"], number> = {
  review_service: 90,
  git_runner: 80,
  tool_runner: 70,
  agent_runtime: 60,
  orchestrator: 50,
  local_runtime: 40
};

const artifactStatusPriority: Record<RuntimeArtifactContent["status"], number> = {
  verified: 30,
  reviewing: 20,
  draft: 10
};

function compareArtifactContent(a: RuntimeArtifactContent, b: RuntimeArtifactContent): number {
  const seededDelta = Number(isSeededArtifactContent(a)) - Number(isSeededArtifactContent(b));
  if (seededDelta !== 0) return seededDelta;

  const sourceDelta = artifactSourcePriority[b.source] - artifactSourcePriority[a.source];
  if (sourceDelta !== 0) return sourceDelta;

  const statusDelta = artifactStatusPriority[b.status] - artifactStatusPriority[a.status];
  if (statusDelta !== 0) return statusDelta;

  const timeDelta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;

  return b.version - a.version;
}

function filterArtifactContent(
  contents: readonly RuntimeArtifactContent[],
  sourceFilter: EvidenceSourceFilter,
  statusFilter: EvidenceStatusFilter
): RuntimeArtifactContent[] {
  return contents.filter((content) => {
    const sourceMatches =
      sourceFilter === "all"
        || sourceFilter === "real" && isRealArtifactContent(content)
        || sourceFilter === content.source;
    const statusMatches = statusFilter === "all" || statusFilter === content.status;

    return sourceMatches && statusMatches;
  });
}

function createOllamaLearningCandidates(contents: readonly RuntimeArtifactContent[]): OllamaLearningCandidate[] {
  return contents
    .filter(isRealArtifactContent)
    .slice(0, 6)
    .map((content) => ({
      id: content.id,
      title: content.title,
      source: content.source,
      status: content.status,
      readiness: content.status === "verified" ? "ready" : content.status === "reviewing" ? "needs_review" : "queued",
      summary: content.summary
    }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactEvidenceText(
  value: string,
  policy: Pick<ToolPolicySnapshot, "workspaceRoot" | "deniedPathPatterns"> | Pick<GitPolicySnapshot, "workspaceRoot" | "deniedPathPatterns">
): { text: string; redactionCount: number } {
  let text = value;
  let redactionCount = 0;

  const replaceAllMatches = (pattern: RegExp, replacement: string | ((match: string, ...groups: string[]) => string)) => {
    text = text.replace(pattern, (...args: string[]) => {
      redactionCount += 1;
      if (typeof replacement === "function") {
        const [match = "", ...groups] = args;
        return replacement(match, ...groups);
      }
      return replacement;
    });
  };

  if (policy.workspaceRoot) {
    replaceAllMatches(new RegExp(escapeRegExp(policy.workspaceRoot), "g"), "[workspace]");
  }

  for (const deniedPath of policy.deniedPathPatterns) {
    if (!deniedPath.trim()) continue;
    replaceAllMatches(new RegExp(escapeRegExp(deniedPath), "gi"), "[denied path]");
  }

  replaceAllMatches(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]");
  replaceAllMatches(/\b(?:sk|sk-proj)-[A-Za-z0-9_-]{8,}/g, "[redacted-api-key]");
  replaceAllMatches(
    /\b((?:api[_-]?key|token|secret|password|passwd|private[_-]?key|authorization|auth[_-]?token)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s"'`]+)/gi,
    (_match, prefix) => `${prefix}[redacted]`
  );

  return { text, redactionCount };
}

function compactEvidenceText(value: string): string {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 900);
}

function createToolCommandSummary(call: ToolCallRecord, policy: ToolPolicySnapshot): CommandOutputSummary {
  const rawPreview = compactEvidenceText([
    call.result?.stdout,
    call.result?.stderr,
    call.result?.patch,
    call.result?.evidence.join("\n")
  ].filter(Boolean).join("\n"));
  const rawSummary = call.result?.summary ?? call.errorSummary ?? call.policy.reason;
  const rawTarget = call.targetPath ?? call.command ?? toolCallKindLabel[call.kind];
  const redactedSummary = redactEvidenceText(rawSummary, policy);
  const redactedPreview = redactEvidenceText(rawPreview || "No command output captured for this record.", policy);
  const redactedTarget = redactEvidenceText(rawTarget, policy);

  return {
    id: call.id,
    source: "tool",
    label: toolCallKindLabel[call.kind],
    status: call.status,
    target: redactedTarget.text,
    summary: redactedSummary.text,
    preview: redactedPreview.text,
    redactionCount: redactedSummary.redactionCount + redactedPreview.redactionCount + redactedTarget.redactionCount,
    updatedAt: call.updatedAt
  };
}

function createGitCommandSummary(operation: GitOperationRecord, policy: GitPolicySnapshot): CommandOutputSummary {
  const changedFiles = operation.result?.diff?.files
    .slice(0, 5)
    .map((file) => `${file.path} (+${file.insertions}/-${file.deletions})`)
    .join("\n");
  const rawPreview = compactEvidenceText([
    operation.result?.summary,
    operation.result?.evidence.join("\n"),
    changedFiles
  ].filter(Boolean).join("\n"));
  const rawSummary = operation.result?.summary ?? operation.errorSummary ?? operation.policy.reason;
  const rawTarget = operation.cwd ?? operation.result?.remoteEvidence?.branchName ?? operation.result?.remoteHealth?.repository ?? gitOperationKindLabel[operation.kind];
  const redactedSummary = redactEvidenceText(rawSummary, policy);
  const redactedPreview = redactEvidenceText(rawPreview || "No Git command output captured for this record.", policy);
  const redactedTarget = redactEvidenceText(rawTarget, policy);

  return {
    id: operation.id,
    source: "git",
    label: gitOperationKindLabel[operation.kind],
    status: operation.status,
    target: redactedTarget.text,
    summary: redactedSummary.text,
    preview: redactedPreview.text,
    redactionCount: redactedSummary.redactionCount + redactedPreview.redactionCount + redactedTarget.redactionCount,
    updatedAt: operation.updatedAt
  };
}

function createCommandOutputSummaries(
  toolCalls: readonly ToolCallRecord[],
  gitOperations: readonly GitOperationRecord[],
  toolPolicy: ToolPolicySnapshot,
  gitPolicy: GitPolicySnapshot
): CommandOutputSummary[] {
  return [
    ...toolCalls.map((call) => createToolCommandSummary(call, toolPolicy)),
    ...gitOperations.map((operation) => createGitCommandSummary(operation, gitPolicy))
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);
}

function createAgentRuntimeGuidance(runtimeInfo: AgentRuntimeInfo, run?: AgentRunRecord): HardeningGuidance[] {
  const guidance: HardeningGuidance[] = [];

  if (runtimeInfo.activeProvider !== "ollama") {
    const detail = !runtimeInfo.ollamaAvailable
      ? `Ollama is not reachable at ${runtimeInfo.ollamaBaseUrl}.`
      : !runtimeInfo.modelAvailable
        ? `${runtimeInfo.model} is not available in the local Ollama library.`
        : runtimeInfo.message;
    guidance.push({
      id: "ollama-unavailable",
      tone: "warning",
      title: "Ollama unavailable",
      detail,
      action: `Start Ollama and pull ${runtimeInfo.model}, or keep deterministic fallback for verification.`
    });
  }

  if (run && run.status !== "completed" && isTerminalAgentRun(run.status)) {
    guidance.push({
      id: "agent-retry",
      tone: run.status === "cancelled" ? "info" : "warning",
      title: "Planner retry is local",
      detail: run.errorSummary ?? `Run ended as ${run.status}.`,
      action: "Retry run repeats planner and verifier work only. It does not run tools, commit code, push branches, or create pull requests."
    });
  }

  return guidance.slice(0, 3);
}

function createMissionControllerGuidance(controller: MissionControllerRecord): HardeningGuidance[] {
  const guidance: HardeningGuidance[] = [];
  const stop = controller.stopReason;

  if (stop) {
    const stageLabel = stop.stage.replaceAll("_", " ");
    const stageAction: Record<typeof stop.code, string> = {
      planning_blocked: "Review the planner artifact and retry after the mission command or assumptions are clearer.",
      tool_failed: "Open Command Output, fix the failing local command, then retry the mission.",
      git_policy: "Check Git policy and workspace state before retry. The controller will not bypass Git read policy.",
      git_not_ready: "Remove denied path changes or add safe changed-file evidence, then build Git evidence again.",
      ci_failed: "Open Review Packet CI, fix the failing command, rerun local CI, then retry the mission.",
      review_revise: "Inspect reviewer notes, refresh the packet after changes, then retry within the bounded loop.",
      review_blocked: "Resolve reviewer blockers before retry. Delivery stays disabled until required reviewers pass.",
      delivery_not_ready: "Refresh the review packet and rebuild delivery after all requirements pass.",
      cancelled: "Resume with Retry mission when the same local evidence should be collected again.",
      unexpected: "Inspect the latest tool, Git, and review evidence before retrying the controller."
    };
    guidance.push({
      id: `controller-${stop.code}`,
      tone: stop.code === "unexpected" ? "danger" : "warning",
      title: `${stageLabel} needs attention`,
      detail: stop.message,
      action: stageAction[stop.code]
    });
  }

  if (controller.status === "completed") {
    guidance.push({
      id: "controller-delivered",
      tone: "success",
      title: "Delivery evidence is ready",
      detail: "The local controller finished planning, evidence, CI, reviewers, and delivery.",
      action: "Use Git policy checks before any branch push or draft PR. Merge and deployment remain human decisions."
    });
  } else if (["blocked", "failed", "cancelled"].includes(controller.status) && controller.attempt < controller.maxAttempts) {
    guidance.push({
      id: "controller-retry-boundary",
      tone: "info",
      title: "Retry boundary",
      detail: `Attempt ${controller.attempt}/${controller.maxAttempts} is terminal and archived before retry.`,
      action: "Retry mission repeats bounded local controller stages. It does not repeat commits, pushes, PR creation, merge, or deploy actions."
    });
  }

  return guidance.slice(0, 3);
}

function createGitHardeningGuidance(policy: GitPolicySnapshot, operations: readonly GitOperationRecord[]): HardeningGuidance[] {
  const guidance: HardeningGuidance[] = [];
  const latestWorktree = operations.find((operation) => operation.result?.worktree)?.result?.worktree;
  const latestRemoteHealth = operations.find((operation) => operation.result?.remoteHealth)?.result?.remoteHealth;
  const latestRemoteEvidence = operations.find((operation) => operation.result?.remoteEvidence)?.result?.remoteEvidence;
  const latestRemotePolicy = operations.find((operation) => operation.result?.remoteMutationPolicy)?.result?.remoteMutationPolicy;
  const blockedMutation = operations.find((operation) => ["branch_push", "draft_pr_create", "local_commit"].includes(operation.kind) && operation.status === "blocked");

  if (latestWorktree?.hasDeniedChanges) {
    guidance.push({
      id: "git-denied-paths",
      tone: "danger",
      title: "Denied path changes",
      detail: "The worktree contains changes in a denied path such as secrets, Git metadata, build output, or private key material.",
      action: "Remove or move denied-path changes before commit planning. The app will not read, diff, commit, push, or serialize those paths."
    });
  }

  if (!policy.allowGitRead) {
    guidance.push({
      id: "git-read-disabled",
      tone: "warning",
      title: "Git read disabled",
      detail: "Git evidence cannot run while read access is disabled by policy.",
      action: "Enable the Git read policy for this local workspace before retrying controller Git evidence."
    });
  }

  if (latestRemoteHealth && latestRemoteHealth.access !== "ok") {
    const authDetail = latestRemoteHealth.access === "auth_required" || latestRemoteHealth.githubAuthenticated === false
      ? "GitHub authentication is not available for the current remote check."
      : latestRemoteHealth.summary;
    guidance.push({
      id: "github-auth-unavailable",
      tone: "warning",
      title: latestRemoteHealth.access === "auth_required" ? "GitHub auth unavailable" : "Remote unavailable",
      detail: authDetail,
      action: "Authenticate with GitHub outside this app, then run Check remote again. Push and PR creation still require explicit policy."
    });
  }

  if (latestRemoteEvidence?.publicationState === "published_stale" || latestRemoteEvidence?.retryable) {
    guidance.push({
      id: "remote-stale",
      tone: "warning",
      title: "Remote evidence is stale",
      detail: latestRemoteEvidence.retryReason ?? latestRemoteEvidence.summary,
      action: "Recheck remote evidence after the branch or draft PR is updated. Do not repeat push or PR creation until policy checks pass again."
    });
  }

  if (latestRemotePolicy && !latestRemotePolicy.allowed) {
    guidance.push({
      id: "remote-policy-blocked",
      tone: "info",
      title: "Remote mutation blocked",
      detail: latestRemotePolicy.blockers.slice(0, 2).join(" ") || latestRemotePolicy.reason,
      action: "Run policy checks with an explicit delivered review packet before branch push or draft PR creation."
    });
  }

  if (blockedMutation) {
    guidance.push({
      id: `blocked-${blockedMutation.kind}`,
      tone: "warning",
      title: `${gitOperationKindLabel[blockedMutation.kind]} blocked`,
      detail: blockedMutation.errorSummary ?? blockedMutation.policy.reason,
      action: "This blocked operation is recorded as evidence only. It did not mutate the repository or remote."
    });
  }

  return uniqueGuidance(guidance).slice(0, 4);
}

function createReviewHardeningGuidance(packet: ReviewPacket): HardeningGuidance[] {
  const guidance: HardeningGuidance[] = [];
  const failedCiCommands = packet.ciRun?.commands.filter((command) => command.status !== "passed") ?? [];
  const deniedRequirement = packet.requirements.find((requirement) => requirement.status === "block" && /denied/i.test(requirement.summary));
  const blockedRequirement = packet.requirements.find((requirement) => requirement.status === "block");

  if (failedCiCommands.length > 0) {
    guidance.push({
      id: "ci-failure",
      tone: "danger",
      title: "Local CI failed",
      detail: failedCiCommands.slice(0, 2).map((command) => `${command.command}: ${command.summary}`).join(" "),
      action: "Fix the failing command evidence, rerun local CI, refresh the packet, then rebuild delivery."
    });
  }

  if (deniedRequirement) {
    guidance.push({
      id: "review-denied-paths",
      tone: "danger",
      title: "Denied path blocks review",
      detail: deniedRequirement.summary,
      action: "Remove denied-path changes before review. Delivery cannot become ready while denied paths are present."
    });
  } else if (blockedRequirement) {
    guidance.push({
      id: `review-${blockedRequirement.id}`,
      tone: "warning",
      title: `${blockedRequirement.label} blocked`,
      detail: blockedRequirement.summary,
      action: "Resolve the blocked evidence item, then refresh evidence before reviewer approval."
    });
  }

  if (packet.status === "delivered") {
    guidance.push({
      id: "human-handoff",
      tone: "success",
      title: "Human handoff ready",
      detail: "The delivery report was generated from local evidence.",
      action: "Use remote policy checks for draft PR handoff. Merge, release, and deployment remain manual."
    });
  }

  return uniqueGuidance(guidance).slice(0, 3);
}

function uniqueGuidance(guidance: readonly HardeningGuidance[]): HardeningGuidance[] {
  const seen = new Set<string>();
  return guidance.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function createArtifactContentsFromSession(snapshot: RuntimeSessionSnapshot): RuntimeArtifactContent[] {
  return snapshot.artifactRecords.map((record) => {
    const task = missionTasks.find((item) => item.id === record.taskId) ?? missionTasks[0]!;
    const route = workflowRoutes.find((item) => item.id === task.routeId) ?? workflowRoutes[0]!;

    return createRuntimeArtifactContent({
      missionId: snapshot.missionId,
      artifactRecord: record,
      missionPlan: snapshot.missionPlan,
      route,
      task,
      createdAt: record.createdAt,
      source: "local_runtime"
    });
  });
}

function mergeArtifactContents(contents: readonly RuntimeArtifactContent[]): RuntimeArtifactContent[] {
  const unique = new Map<string, RuntimeArtifactContent>();

  for (const content of contents) {
    unique.set(content.id, content);
  }

  return [...unique.values()].slice(0, 120);
}

const autopilotActions: AutopilotAction[] = [
  {
    gateId: "technical_design_gate",
    roleId: "tech_lead",
    type: "gate",
    title: "Technical gate passed",
    summary: "Architecture notes now include API assumptions, rollback path, and mapped test strategy.",
    tone: "success",
    time: "10:56",
    status: "passed",
    score: 88,
    note: "Design review passed; implementation can continue with documented API assumptions."
  },
  {
    gateId: "implementation_gate",
    roleId: "frontend_developer",
    type: "artifact",
    title: "Implementation evidence attached",
    summary: "Frontend agent linked component state, table filters, and export behavior to the acceptance matrix.",
    tone: "info",
    time: "10:59",
    status: "reviewing",
    score: 84,
    note: "Implementation evidence is ready for Tech Lead and Automation QA review."
  },
  {
    gateId: "qa_gate",
    roleId: "automation_qa",
    type: "tool",
    title: "QA automation running",
    summary: "Browser, export, and empty-state checks are executing against staging-like data.",
    tone: "warning",
    time: "11:03",
    status: "running",
    score: 73,
    note: "Automation is running; manual QA remains queued for exploratory review."
  },
  {
    gateId: "release_gate",
    roleId: "devops_lead",
    type: "risk",
    title: "Release gate still blocked",
    summary: "Staging deploy can proceed, but production requires explicit policy and smoke evidence.",
    tone: "danger",
    time: "11:07",
    status: "blocked",
    score: 64,
    note: "Release remains blocked for production; staging path is available for controlled verification."
  },
  {
    gateId: "final_report_gate",
    roleId: "technical_writer",
    type: "phase",
    title: "Final report shell prepared",
    summary: "Delivery report now tracks assumptions, gate scores, linked artifacts, and remaining blockers.",
    tone: "info",
    time: "11:11",
    status: "reviewing",
    score: 70,
    note: "Report shell is ready and waits for QA plus release gate outcomes."
  },
  {
    gateId: "final_report_gate",
    roleId: "ceo",
    type: "gate",
    title: "Executive approval queued",
    summary: "CEO receives the final report package and checks assumptions, scope, evidence, and blockers.",
    tone: "info",
    time: "11:16",
    status: "reviewing",
    score: 78,
    note: "Executive sign-off is queued until final QA and deployment blockers are reconciled."
  }
];

function calculateRoomWorkloads(taskRuns: Record<string, TaskRunStatus>): Record<DepartmentId, RoomWorkload> {
  return calculateMissionRoomWorkloads(missionTasks, taskRuns) as Record<DepartmentId, RoomWorkload>;
}

function calculateAgentWorkloads(taskRuns: Record<string, TaskRunStatus>): Partial<Record<RoleId, AgentWorkload>> {
  return calculateMissionAgentWorkloads(missionTasks, taskRuns) as Partial<Record<RoleId, AgentWorkload>>;
}

export function App() {
  const [initialSession] = useState(loadRuntimeSession);
  const [missionId, setMissionId] = useState(initialSession.missionId);
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId>(initialSession.selection.selectedRoleId);
  const [selectedRoomId, setSelectedRoomId] = useState<DepartmentId>(initialSession.selection.selectedRoomId);
  const [selectedGateId, setSelectedGateId] = useState<QualityGateId>(initialSession.selection.selectedGateId);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(initialSession.selection.selectedArtifactId);
  const [gateRuns, setGateRuns] = useState<Record<QualityGateId, GateRun>>(initialSession.runtime.gateRuns as Record<QualityGateId, GateRun>);
  const [taskRuns, setTaskRuns] = useState<Record<string, TaskRunStatus>>(initialSession.runtime.taskRuns as Record<string, TaskRunStatus>);
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>(initialSession.runtime.activityLog as ActivityEvent[]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [autopilotCursor, setAutopilotCursor] = useState(initialSession.runtime.autopilotCursor);
  const [activeRouteIndex, setActiveRouteIndex] = useState(initialSession.runtime.activeRouteIndex);
  const [commandDraft, setCommandDraft] = useState(initialSession.commandDraft);
  const [assumptionDraft, setAssumptionDraft] = useState(initialSession.assumptionDraft);
  const [missionAssumptions, setMissionAssumptions] = useState<AssumptionRecord[]>([...initialSession.missionAssumptions]);
  const [missionPlan, setMissionPlan] = useState(initialSession.missionPlan);
  const [missionState, setMissionState] = useState(initialSession.missionState);
  const [lastSavedCommandDraft, setLastSavedCommandDraft] = useState(initialSession.commandDraft);
  const [artifactRecords, setArtifactRecords] = useState<RuntimeArtifactRecord[]>([...initialSession.artifactRecords]);
  const [artifactContents, setArtifactContents] = useState<RuntimeArtifactContent[]>(() => createArtifactContentsFromSession(initialSession));
  const [auditEvents, setAuditEvents] = useState<RuntimeAuditEvent[]>([...initialSession.auditEvents]);
  const [lastSavedAt, setLastSavedAt] = useState(initialSession.savedAt);
  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorConnectionStatus>("checking");
  const [orchestratorMessage, setOrchestratorMessage] = useState("Checking orchestrator service.");
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [isMissionSaving, setIsMissionSaving] = useState(false);
  const [agentRuntimeInfo, setAgentRuntimeInfo] = useState<AgentRuntimeInfo>(initialAgentRuntimeInfo);
  const [activeAgentRun, setActiveAgentRun] = useState<AgentRunRecord | undefined>();
  const [agentRunEvents, setAgentRunEvents] = useState<AgentRunEvent[]>([]);
  const [toolPolicy, setToolPolicy] = useState<ToolPolicySnapshot>(initialToolPolicy);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [isToolRunning, setIsToolRunning] = useState(false);
  const [gitPolicy, setGitPolicy] = useState<GitPolicySnapshot>(initialGitPolicy);
  const [gitOperations, setGitOperations] = useState<GitOperationRecord[]>([]);
  const [isGitRunning, setIsGitRunning] = useState(false);
  const [automationPolicy, setAutomationPolicy] = useState<AutomationPolicySnapshot>(initialAutomationPolicy);
  const [reviewPackets, setReviewPackets] = useState<ReviewPacket[]>([]);
  const [isReviewRunning, setIsReviewRunning] = useState(false);
  const [missionControllers, setMissionControllers] = useState<MissionControllerRecord[]>([]);
  const [missionHistory, setMissionHistory] = useState<MissionHistorySummary[]>([]);
  const [recoveredHistory, setRecoveredHistory] = useState<MissionHistoryRecord | undefined>();
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const selectedGate = QUALITY_GATES.find((gate) => gate.id === selectedGateId) ?? QUALITY_GATES[0]!;
  const selectedGateRun = gateRuns[selectedGate.id];
  const selectedRaci = PHASE_RACI.find((item) => item.phase === selectedGate.phase) ?? PHASE_RACI[0]!;
  const selectedRouting = AGENT_MODEL_ROUTING[selectedRoleId];
  const selectedActiveRole = activeRoles.find((role) => role.roleId === selectedRoleId);
  const activeRoute = workflowRoutes[activeRouteIndex] ?? workflowRoutes[0]!;
  const activeTask = missionTasks[activeRouteIndex] ?? missionTasks[0]!;
  const activeMissionController = missionControllers[0];
  const missionTitle = missionState.title || missionPlan.title;
  const latestReviewPacket = reviewPackets[0];
  const realEvidenceCount = artifactContents.filter(isRealArtifactContent).length;
  const controllerSignalStatus = activeMissionController?.status ?? missionState.status;
  const remoteMutationEnabled = gitPolicy.allowRemotePush || gitPolicy.allowPullRequestCreate;
  const handoffSignal = createRemoteHandoffSignalSummary({
    auditEvents,
    gitOperations,
    remoteMutationEnabled
  });
  const controllerSignalTone: WarRoomSignal["tone"] =
    activeMissionController?.status === "blocked" || activeMissionController?.status === "failed"
      ? "red"
      : activeMissionController?.status === "completed" || missionState.status === "delivered"
        ? "green"
        : isAutopilotRunning
          ? "blue"
          : "amber";
  const warRoomSignals: WarRoomSignal[] = [
    {
      id: "runtime",
      icon: "cpu",
      label: "Runtime",
      value: agentRuntimeInfo.activeProvider === "ollama" ? "Ollama" : "Fallback",
      detail: agentRuntimeInfo.activeProvider === "ollama" ? agentRuntimeInfo.model : "Deterministic fallback visible",
      tone: agentRuntimeInfo.activeProvider === "ollama" ? "green" : "amber"
    },
    {
      id: "controller",
      icon: "activity",
      label: "Controller",
      value: controllerSignalStatus.replaceAll("_", " "),
      detail: activeMissionController
        ? `Stage ${activeMissionController.currentStage.replaceAll("_", " ")}`
        : missionState.statusReason,
      tone: controllerSignalTone
    },
    {
      id: "evidence",
      icon: "shield",
      label: "Evidence",
      value: `${realEvidenceCount} real`,
      detail: `${artifactContents.length} artifact memories tracked`,
      tone: realEvidenceCount > 0 ? "green" : "amber"
    },
    {
      id: "handoff",
      icon: "git",
      label: "Handoff",
      value: handoffSignal.value,
      detail: handoffSignal.detail,
      tone: handoffSignal.tone
    }
  ];

  const filteredActivity = useMemo(
    () => activityLog.filter((event) => activityFilter === "all" || event.type === activityFilter),
    [activityFilter, activityLog]
  );

  const roomWorkloads = useMemo(() => calculateRoomWorkloads(taskRuns), [taskRuns]);
  const agentWorkloads = useMemo(() => calculateAgentWorkloads(taskRuns), [taskRuns]);

  function createCurrentRuntimeSession(
    savedAt: string,
    overrides: {
      missionState?: RuntimeMissionState;
      missionPlan?: ReturnType<typeof parseMissionCommand>;
      commandDraft?: string;
      assumptionDraft?: string;
      missionAssumptions?: readonly AssumptionRecord[];
      auditEvents?: readonly RuntimeAuditEvent[];
    } = {}
  ): RuntimeSessionSnapshot {
    return createRuntimeSessionSnapshot({
      missionId,
      commandDraft: overrides.commandDraft ?? commandDraft,
      assumptionDraft: overrides.assumptionDraft ?? assumptionDraft,
      missionAssumptions: overrides.missionAssumptions ?? missionAssumptions,
      missionPlan: overrides.missionPlan ?? missionPlan,
      missionState: overrides.missionState ?? missionState,
      runtime: {
        gateRuns,
        taskRuns,
        activityLog,
        activeRouteIndex,
        autopilotCursor
      },
      selection: {
        selectedGateId,
        selectedRoleId,
        selectedRoomId,
        selectedArtifactId
      },
      artifactRecords,
      auditEvents: overrides.auditEvents ?? auditEvents,
      savedAt
    });
  }

  function applyRuntimeSessionSnapshot(snapshot: RuntimeSessionSnapshot) {
    setMissionId(snapshot.missionId);
    setCommandDraft(snapshot.commandDraft);
    setAssumptionDraft(snapshot.assumptionDraft);
    setMissionAssumptions([...snapshot.missionAssumptions]);
    setMissionPlan(snapshot.missionPlan);
    setMissionState(snapshot.missionState);
    setGateRuns(snapshot.runtime.gateRuns as Record<QualityGateId, GateRun>);
    setTaskRuns(snapshot.runtime.taskRuns as Record<string, TaskRunStatus>);
    setActivityLog(snapshot.runtime.activityLog as ActivityEvent[]);
    setAutopilotCursor(snapshot.runtime.autopilotCursor);
    setActiveRouteIndex(snapshot.runtime.activeRouteIndex);
    setSelectedGateId(snapshot.selection.selectedGateId);
    setSelectedRoleId(snapshot.selection.selectedRoleId);
    setSelectedRoomId(snapshot.selection.selectedRoomId);
    setSelectedArtifactId(snapshot.selection.selectedArtifactId);
    setArtifactRecords([...snapshot.artifactRecords]);
    setAuditEvents([...snapshot.auditEvents]);
    setLastSavedAt(snapshot.savedAt);
    setLastSavedCommandDraft(snapshot.commandDraft);
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchOrchestratorSession(initialSession),
      fetchOrchestratorArtifacts(),
      fetchAgentRuntimeInfo(),
      fetchAgentRuns(initialSession.missionId),
      fetchToolPolicy(),
      fetchToolCalls(initialSession.missionId),
      fetchGitPolicy(),
      fetchAutomationPolicy(),
      fetchGitOperations(initialSession.missionId),
      fetchReviewPackets(initialSession.missionId),
      fetchMissionControllers(initialSession.missionId),
      fetchMissionHistory()
    ])
      .then(([snapshot, contents, runtimeInfo, runs, policy, calls, gitPolicy, automationPolicy, gitOperations, reviewPackets, controllers, history]) => {
        if (cancelled) {
          return;
        }

        applyRuntimeSessionSnapshot(snapshot);
        setArtifactContents(contents);
        setAgentRuntimeInfo(runtimeInfo);
        setActiveAgentRun(runs[0]);
        setToolPolicy(policy);
        setToolCalls(calls);
        setGitPolicy(gitPolicy);
        setAutomationPolicy(automationPolicy);
        setGitOperations(gitOperations);
        setReviewPackets(reviewPackets);
        setMissionControllers(controllers);
        setMissionHistory(history);
        setIsAutopilotRunning(Boolean(
          controllers[0] && !isTerminalMissionController(controllers[0].status)
          || runs[0] && !isTerminalAgentRun(runs[0].status)
        ));
        setOrchestratorStatus("connected");
        setOrchestratorMessage("Loaded mission session from the orchestrator service.");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setOrchestratorStatus("local");
        setOrchestratorMessage(`Using browser memory: ${formatOrchestratorError(error)}`);
      });

    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  useEffect(() => {
    const controllerId = activeMissionController?.id;
    if (!controllerId || isTerminalMissionController(activeMissionController.status)) return;
    let cancelled = false;

    const refreshController = async () => {
      try {
        const [controller, runs] = await Promise.all([
          fetchMissionController(controllerId),
          fetchAgentRuns(missionId)
        ]);
        if (cancelled) return;
        setMissionControllers((items) => [controller, ...items.filter((item) => item.id !== controller.id)]);
        if (runs[0]) setActiveAgentRun(runs[0]);
        setIsAutopilotRunning(!isTerminalMissionController(controller.status));
        setOrchestratorMessage(controller.stopReason?.message ?? `Mission controller ${controller.status}: ${controller.currentStage.replaceAll("_", " ")}.`);
        if (isTerminalMissionController(controller.status)) {
          const [snapshot, contents, calls, operations, packets, controllers, history] = await Promise.all([
            fetchOrchestratorSession(initialSession),
            fetchOrchestratorArtifacts(),
            fetchToolCalls(missionId),
            fetchGitOperations(missionId),
            fetchReviewPackets(missionId),
            fetchMissionControllers(missionId),
            fetchMissionHistory()
          ]);
          if (cancelled) return;
          applyRuntimeSessionSnapshot(snapshot);
          setArtifactContents(contents);
          setToolCalls(calls);
          setGitOperations(operations);
          setReviewPackets(packets);
          setMissionControllers(controllers);
          setMissionHistory(history);
          setActivityFilter(controller.status === "completed" ? "phase" : "risk");
        }
      } catch (error) {
        if (!cancelled) setOrchestratorMessage(`Controller refresh failed: ${formatOrchestratorError(error)}`);
      }
    };

    void refreshController();
    const interval = window.setInterval(() => void refreshController(), 350);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeMissionController?.id, activeMissionController?.status, missionId]);

  useEffect(() => {
    const runId = activeAgentRun?.id;
    if (!runId || isTerminalAgentRun(activeAgentRun.status)) return;
    let cancelled = false;

    const refreshRun = async () => {
      try {
        const run = await fetchAgentRun(runId);
        if (cancelled) return;
        setActiveAgentRun(run);
        if (isTerminalAgentRun(run.status)) {
          const controllerIsRunning = Boolean(activeMissionController && !isTerminalMissionController(activeMissionController.status));
          if (!controllerIsRunning) setIsAutopilotRunning(false);
          const [snapshot, contents] = await Promise.all([
            fetchOrchestratorSession(createCurrentRuntimeSession(new Date().toISOString())),
            fetchOrchestratorArtifacts()
          ]);
          if (cancelled) return;
          applyRuntimeSessionSnapshot(snapshot);
          setArtifactContents(contents);
          setOrchestratorStatus("connected");
          if (!controllerIsRunning) setOrchestratorMessage(`Agent run ${run.status} with ${run.provider}.`);
        }
      } catch (error) {
        if (!cancelled) setOrchestratorMessage(`Run status refresh failed: ${formatOrchestratorError(error)}`);
      }
    };

    const unsubscribe = subscribeToAgentRun(
      runId,
      (event) => {
        setAgentRunEvents((events) => [...events.filter((item) => item.id !== event.id), event].sort((a, b) => a.sequence - b.sequence).slice(-30));
        void refreshRun();
      },
      () => setOrchestratorMessage("Live event stream reconnecting; persisted run polling remains active.")
    );
    const polling = window.setInterval(() => void refreshRun(), 1500);
    void refreshRun();
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(polling);
    };
  }, [activeAgentRun?.id, activeAgentRun?.status, activeMissionController?.status]);

  useEffect(() => {
    const savedAt = new Date().toISOString();
    const snapshot = createCurrentRuntimeSession(savedAt);

    saveRuntimeSession(snapshot);
    setLastSavedAt(savedAt);
  }, [
    activeRouteIndex,
    activityLog,
    artifactRecords,
    assumptionDraft,
    auditEvents,
    autopilotCursor,
    commandDraft,
    gateRuns,
    missionState,
    missionAssumptions,
    missionPlan,
    selectedArtifactId,
    selectedGateId,
    selectedRoleId,
    selectedRoomId,
    taskRuns
  ]);

  function updateCommandDraft(value: string) {
    const savedAt = new Date().toISOString();
    const nextPlan = parseMissionCommand(value);

    setCommandDraft(value);
    setMissionPlan(nextPlan);
    setMissionState((current) =>
      createRuntimeMissionState({
        commandDraft: value,
        missionPlan: nextPlan,
        savedAt,
        previousState: current,
        source: "local",
        status: "draft",
        statusReason: "Mission command has local draft edits."
      })
    );
  }

  function updateAssumptionDraft(value: string) {
    const savedAt = new Date().toISOString();

    setAssumptionDraft(value);
    setMissionState((current) =>
      createRuntimeMissionState({
        commandDraft,
        missionPlan,
        savedAt,
        previousState: current,
        source: "local",
        status: "draft",
        statusReason: "Mission assumptions have local draft edits."
      })
    );
  }

  async function saveMissionIntake() {
    if (isMissionSaving || isAutopilotRunning || commandDraft.trim().length === 0) {
      return;
    }

    const savedAt = new Date().toISOString();
    const parsedPlan = parseMissionCommand(commandDraft);
    const nextMissionAssumptions = createAssumptionsFromDraft({
      missionId,
      draft: assumptionDraft,
      previousAssumptions: missionAssumptions,
      createdAt: savedAt
    });
    const intakeAudit = createRuntimeAuditEvent({
      id: `audit-mission-intake-${Date.now()}`,
      actorRoleId: "chief_of_staff",
      action: "mission_saved",
      summary: `Mission intake saved for ${parsedPlan.title} with ${nextMissionAssumptions.length} assumptions.`,
      severity: "success",
      entityId: missionId,
      createdAt: savedAt
    });
    const nextAuditEvents = [intakeAudit, ...auditEvents].slice(0, 200);
    const orchestratorMissionState = createRuntimeMissionState({
      commandDraft,
      missionPlan: parsedPlan,
      savedAt,
      previousState: missionState,
      source: "orchestrator",
      status: "saved",
      statusReason: "Mission intake saved to the orchestrator."
    });
    const syncSnapshot = createCurrentRuntimeSession(savedAt, {
      missionState: orchestratorMissionState,
      missionPlan: parsedPlan,
      commandDraft,
      assumptionDraft,
      missionAssumptions: nextMissionAssumptions,
      auditEvents: nextAuditEvents
    });

    setIsMissionSaving(true);
    setMissionAssumptions(nextMissionAssumptions);
    setMissionPlan(parsedPlan);
    setMissionState(orchestratorMissionState);
    setAuditEvents(nextAuditEvents);
    setOrchestratorStatus("syncing");
    setOrchestratorMessage("Saving mission intake to the orchestrator.");

    try {
      const snapshot = await saveOrchestratorSession(syncSnapshot, syncSnapshot);
      applyRuntimeSessionSnapshot(snapshot);
      setMissionHistory(await fetchMissionHistory());
      setOrchestratorStatus("connected");
      setOrchestratorMessage("Mission intake saved to the orchestrator.");
    } catch (error) {
      const localMissionState = createRuntimeMissionState({
        commandDraft,
        missionPlan: parsedPlan,
        savedAt,
        previousState: missionState,
        source: "local",
        status: "saved",
        statusReason: "Mission intake saved in browser memory because the orchestrator is unavailable."
      });
      const localSnapshot = createCurrentRuntimeSession(savedAt, {
        missionState: localMissionState,
        missionPlan: parsedPlan,
        commandDraft,
        assumptionDraft,
        missionAssumptions: nextMissionAssumptions,
        auditEvents: nextAuditEvents
      });

      setMissionState(localMissionState);
      setMissionAssumptions(nextMissionAssumptions);
      saveRuntimeSession(localSnapshot);
      setLastSavedAt(savedAt);
      setLastSavedCommandDraft(commandDraft);
      setOrchestratorStatus("local");
      setOrchestratorMessage(`Saved locally: ${formatOrchestratorError(error)}`);
    } finally {
      setIsMissionSaving(false);
    }
  }

  function resetMissionDraft() {
    const restoredCommand = lastSavedCommandDraft.trim() ? lastSavedCommandDraft : DEFAULT_MISSION_COMMAND;
    const restoredAssumptionDraft = formatAssumptionDraft(missionAssumptions);
    const restoredPlan = parseMissionCommand(restoredCommand);
    const resetAt = new Date().toISOString();

    setCommandDraft(restoredCommand);
    setAssumptionDraft(restoredAssumptionDraft);
    setMissionPlan(restoredPlan);
    setMissionState((current) =>
      createRuntimeMissionState({
        commandDraft: restoredCommand,
        missionPlan: restoredPlan,
        savedAt: resetAt,
        previousState: current,
        source: current.source,
        status: "saved",
        statusReason: "Draft reset to the last saved mission intake."
      })
    );
    setOrchestratorMessage("Draft reset to the last saved mission intake.");
  }

  function selectRole(role: ActiveRole) {
    setSelectedRoleId(role.roleId);
    setSelectedRoomId(role.room);
    setSelectedGateId(roleStatusGate[role.status]);
  }

  function selectRoom(department: DepartmentId) {
    const roomAgent = activeRoles.find((role) => role.room === department);
    const fallbackRole = findRoleByDepartment(department);

    setSelectedRoomId(department);

    if (roomAgent) {
      setSelectedRoleId(roomAgent.roleId);
      setSelectedGateId(roleStatusGate[roomAgent.status]);
      return;
    }

    if (fallbackRole) {
      setSelectedRoleId(fallbackRole.id);
    }
  }

  function selectGate(gateId: QualityGateId) {
    const run = gateRuns[gateId];
    const ownerRoom = roleDefinition(run.ownerRoleId).department;

    setSelectedGateId(gateId);
    setSelectedRoleId(run.ownerRoleId);
    setSelectedRoomId(ownerRoom);
  }

  function selectTask(taskId: string) {
    const taskIndex = missionTasks.findIndex((task) => task.id === taskId);
    const task = missionTasks[taskIndex];
    const route = task ? workflowRoutes.find((item) => item.id === task.routeId) : undefined;

    if (!task || !route || taskIndex < 0) {
      return;
    }

    setActiveRouteIndex(taskIndex);
    setSelectedRoleId(task.ownerRoleId);
    setSelectedRoomId(task.room);
    setSelectedGateId(task.gateId);
    setSelectedArtifactId(task.artifactId);
  }

  function runLocalAutopilotStep() {
    const parsedPlan = parseMissionCommand(commandDraft);
    const route = workflowRoutes[activeRouteIndex] ?? workflowRoutes[0]!;
    const task = missionTasks[activeRouteIndex] ?? missionTasks[0]!;
    const artifact = artifactEvidence.find((item) => item.id === route.artifactId);
    const createdAt = new Date().toISOString();
    const transition = advanceMissionRuntime(
      {
        gateRuns,
        taskRuns,
        activityLog,
        activeRouteIndex,
        autopilotCursor
      },
      {
        routes: workflowRoutes,
        tasks: missionTasks,
        actions: autopilotActions
      }
    );
    const artifactRecord = createRuntimeArtifactRecord({
      artifactId: route.artifactId,
      taskId: task.id,
      title: artifact?.title ?? route.label,
      summary: artifact?.summary ?? parsedPlan.summary,
      ownerRoleId: route.toRoleId,
      gateId: route.gateId,
      status: transition.gateRuns[route.gateId]?.status === "passed" ? "verified" : "reviewing",
      version: autopilotCursor + 1,
      createdAt
    });
    const artifactContent = createRuntimeArtifactContent({
      missionId,
      artifactRecord,
      missionPlan: parsedPlan,
      route,
      task,
      createdAt,
      source: "local_runtime"
    });

    setMissionPlan(parsedPlan);
    setMissionState((current) =>
      createRuntimeMissionState({
        commandDraft,
        missionPlan: parsedPlan,
        savedAt: createdAt,
        previousState: current,
        source: "local",
        status: "saved",
        statusReason: "Local fallback advanced one mission step."
      })
    );
    setGateRuns(transition.gateRuns as Record<QualityGateId, GateRun>);
    setActivityLog(transition.activityLog as ActivityEvent[]);
    setArtifactRecords((records) => [artifactRecord, ...records].slice(0, 50));
    setArtifactContents((contents) => mergeArtifactContents([artifactContent, ...contents]));
    setAuditEvents((events) => [
      createRuntimeAuditEvent({
        id: `audit-autopilot-${autopilotCursor + 1}`,
        actorRoleId: route.toRoleId,
        action: "task_advanced",
        summary: `${route.label} advanced from ${shortRoleName(route.fromRoleId)} to ${shortRoleName(route.toRoleId)}.`,
        severity: transition.gateRuns[route.gateId]?.status === "blocked" ? "warning" : "success",
        entityId: task.id,
        createdAt
      }),
      ...events
    ].slice(0, 80));
    setActivityFilter("all");
    setSelectedGateId(transition.selectedGateId);
    setSelectedRoleId(transition.selectedRoleId);
    setSelectedRoomId(transition.selectedRoomId);
    setSelectedArtifactId(transition.selectedArtifactId);
    setTaskRuns(transition.taskRuns as Record<string, TaskRunStatus>);
    setAutopilotCursor(transition.autopilotCursor);
    setActiveRouteIndex(transition.activeRouteIndex);
  }

  async function runAutopilotStep() {
    if (isAutopilotRunning) {
      return;
    }

    const startedAt = new Date().toISOString();
    const runningMissionState = createRuntimeMissionState({
      commandDraft,
      missionPlan,
      savedAt: startedAt,
      previousState: missionState,
      source: "mission_controller",
      status: "running",
      statusReason: "Mission controller is executing the current intake."
    });
    const syncSnapshot = createCurrentRuntimeSession(startedAt, { missionState: runningMissionState });

    setIsAutopilotRunning(true);
    setMissionState(runningMissionState);
    setOrchestratorStatus("syncing");
    setOrchestratorMessage("Saving the current mission state before server autopilot.");

    try {
      await saveOrchestratorSession(syncSnapshot, syncSnapshot);
      const controller = await startMissionController({
        missionId,
        taskId: activeTask.id,
        command: commandDraft,
        idempotencyKey: `${missionId}:${activeTask.id}:${Date.now()}`,
        providerPreference: "auto"
      });
      setMissionControllers((items) => [controller, ...items.filter((item) => item.id !== controller.id)]);
      setAgentRunEvents([]);
      setActivityFilter("all");
      setOrchestratorStatus("connected");
      setOrchestratorMessage(`Started autonomous mission at ${controller.currentStage.replaceAll("_", " ")}.`);
    } catch (error) {
      runLocalAutopilotStep();
      setOrchestratorStatus("local");
      setOrchestratorMessage(`Local fallback used: ${formatOrchestratorError(error)}`);
      setIsAutopilotRunning(false);
    }
  }

  async function cancelActiveMissionController() {
    if (!activeMissionController || isTerminalMissionController(activeMissionController.status)) return;
    const controller = await cancelMissionController(activeMissionController.id);
    setMissionControllers((items) => [controller, ...items.filter((item) => item.id !== controller.id)]);
    setMissionState((current) =>
      createRuntimeMissionState({
        commandDraft,
        missionPlan,
        savedAt: controller.updatedAt,
        previousState: current,
        source: "mission_controller",
        status: "blocked",
        statusReason: controller.stopReason?.message ?? "Mission controller was cancelled."
      })
    );
    setIsAutopilotRunning(false);
    setMissionHistory(await fetchMissionHistory());
  }

  async function retryActiveMissionController() {
    if (!activeMissionController || !["blocked", "failed", "cancelled"].includes(activeMissionController.status)) return;
    const controller = await retryMissionController(activeMissionController.id);
    setMissionControllers((items) => [controller, ...items.filter((item) => item.id !== controller.id)]);
    setMissionState((current) =>
      createRuntimeMissionState({
        commandDraft,
        missionPlan,
        savedAt: controller.updatedAt,
        previousState: current,
        source: "mission_controller",
        status: "running",
        statusReason: `Retrying autonomous mission, attempt ${controller.attempt}/${controller.maxAttempts}.`
      })
    );
    setIsAutopilotRunning(true);
    setOrchestratorStatus("connected");
    setOrchestratorMessage(`Retrying autonomous mission, attempt ${controller.attempt}/${controller.maxAttempts}.`);
    setMissionHistory(await fetchMissionHistory());
  }

  async function cancelActiveAgentRun() {
    if (!activeAgentRun || isTerminalAgentRun(activeAgentRun.status)) return;
    const run = await cancelAgentRun(activeAgentRun.id);
    setActiveAgentRun(run);
    setIsAutopilotRunning(false);
  }

  async function retryActiveAgentRun() {
    if (!activeAgentRun || !isTerminalAgentRun(activeAgentRun.status)) return;
    const run = await retryAgentRun(activeAgentRun.id);
    setActiveAgentRun(run);
    setAgentRunEvents([]);
    setIsAutopilotRunning(true);
  }

  async function executeLocalToolCall(input: Omit<ToolCallRequest, "missionId">) {
    if (isToolRunning) return;
    setIsToolRunning(true);
    setOrchestratorStatus("syncing");
    setOrchestratorMessage("Running a local workspace tool with policy checks.");

    try {
      const call = await startToolCall({ ...input, missionId });
      setToolCalls((calls) => [call, ...calls.filter((item) => item.id !== call.id)].slice(0, 20));
      const [snapshot, contents, calls] = await Promise.all([
        fetchOrchestratorSession(createCurrentRuntimeSession(new Date().toISOString())),
        fetchOrchestratorArtifacts(),
        fetchToolCalls(missionId)
      ]);
      applyRuntimeSessionSnapshot(snapshot);
      setArtifactContents(contents);
      setToolCalls(calls);
      setActivityFilter("tool");
      setOrchestratorStatus("connected");
      setOrchestratorMessage(`${toolCallKindLabel[call.kind]} ${toolCallStatusLabel[call.status].toLowerCase()}: ${call.result?.summary ?? call.errorSummary ?? call.policy.reason}`);
    } catch (error) {
      setOrchestratorStatus("local");
      setOrchestratorMessage(`Tool runner unavailable: ${formatOrchestratorError(error)}`);
    } finally {
      setIsToolRunning(false);
    }
  }

  function inspectImplementationPlan() {
    void executeLocalToolCall({
      taskId: "task-local-plan-inspection",
      roleId: "tech_lead",
      kind: "file_read",
      targetPath: "docs/NEXT_IMPLEMENTATION_PLAN.md"
    });
  }

  function runTypecheckEvidence() {
    void executeLocalToolCall({
      taskId: "task-local-typecheck",
      roleId: "automation_qa",
      kind: "test_command",
      command: "npm run typecheck"
    });
  }

  async function executeGitOperation(input: Omit<GitOperationRequest, "missionId">) {
    if (isGitRunning) return;
    setIsGitRunning(true);
    setOrchestratorStatus("syncing");
    setOrchestratorMessage("Running a local Git operation with policy checks.");

    try {
      const operation = await startGitOperation({ ...input, missionId });
      setGitOperations((operations) => [operation, ...operations.filter((item) => item.id !== operation.id)].slice(0, 20));
      const [snapshot, contents, operations] = await Promise.all([
        fetchOrchestratorSession(createCurrentRuntimeSession(new Date().toISOString())),
        fetchOrchestratorArtifacts(),
        fetchGitOperations(missionId)
      ]);
      applyRuntimeSessionSnapshot(snapshot);
      setArtifactContents(contents);
      setGitOperations(operations);
      setActivityFilter("tool");
      setOrchestratorStatus("connected");
      setOrchestratorMessage(`${gitOperationKindLabel[operation.kind]} ${gitOperationStatusLabel[operation.status].toLowerCase()}: ${operation.result?.summary ?? operation.errorSummary ?? operation.policy.reason}`);
    } catch (error) {
      setOrchestratorStatus("local");
      setOrchestratorMessage(`Git runner unavailable: ${formatOrchestratorError(error)}`);
    } finally {
      setIsGitRunning(false);
    }
  }

  function checkGitStatus() {
    void executeGitOperation({
      taskId: "task-git-status",
      roleId: "tech_lead",
      kind: "status"
    });
  }

  function buildCommitPlan() {
    void executeGitOperation({
      taskId: "task-git-commit-plan",
      roleId: "tech_lead",
      kind: "commit_plan",
      baseBranch: "main"
    });
  }

  function draftPullRequest() {
    void executeGitOperation({
      taskId: "task-git-pr-draft",
      roleId: "tech_lead",
      kind: "pr_draft",
      baseBranch: "main"
    });
  }

  function checkRemoteHealth() {
    void executeGitOperation({
      taskId: "task-git-remote-health",
      roleId: "devops_lead",
      kind: "remote_health",
      baseBranch: "main"
    });
  }

  function checkRemoteEvidence() {
    void executeGitOperation({
      taskId: "task-git-remote-evidence",
      roleId: "release_manager",
      kind: "remote_evidence",
      baseBranch: "main",
      branchName: proposedRemoteBranchName()
    });
  }

  function latestReviewPacketForRemotePolicy(): ReviewPacket | undefined {
    return reviewPackets.find((packet) => packet.status === "delivered") ?? reviewPackets[0];
  }

  function proposedRemoteBranchName(): string {
    const latestMutationBranch = gitOperations.find((operation) => operation.result?.remoteMutationPolicy?.branchName)?.result?.remoteMutationPolicy?.branchName;
    const latestWorktreeBranch = gitOperations.find((operation) => operation.result?.worktree?.branch)?.result?.worktree?.branch;
    const latestPlanBranch = gitOperations.find((operation) => operation.result?.commitPlan?.branchName)?.result?.commitPlan?.branchName;
    if (latestMutationBranch?.startsWith("codex/")) return latestMutationBranch;
    if (latestWorktreeBranch?.startsWith("codex/")) return latestWorktreeBranch;
    return latestPlanBranch ?? "codex/phase-7-remote-mutation-policy";
  }

  function checkBranchPushPolicy() {
    const packet = latestReviewPacketForRemotePolicy();
    void executeGitOperation({
      taskId: "task-git-branch-push-policy",
      roleId: "release_manager",
      kind: "branch_push_policy",
      baseBranch: "main",
      branchName: proposedRemoteBranchName(),
      ...(packet ? { reviewPacketId: packet.id } : {})
    });
  }

  function checkDraftPrPolicy() {
    const packet = latestReviewPacketForRemotePolicy();
    void executeGitOperation({
      taskId: "task-git-draft-pr-policy",
      roleId: "release_manager",
      kind: "draft_pr_policy",
      baseBranch: "main",
      branchName: proposedRemoteBranchName(),
      ...(packet ? { reviewPacketId: packet.id } : {})
    });
  }

  function pushRemoteBranch() {
    const packet = latestReviewPacketForRemotePolicy();
    void executeGitOperation({
      taskId: "task-git-branch-push",
      roleId: "release_manager",
      kind: "branch_push",
      baseBranch: "main",
      branchName: proposedRemoteBranchName(),
      ...(packet ? { reviewPacketId: packet.id } : {})
    });
  }

  function createDraftPr() {
    const packet = latestReviewPacketForRemotePolicy();
    void executeGitOperation({
      taskId: "task-git-draft-pr-create",
      roleId: "release_manager",
      kind: "draft_pr_create",
      baseBranch: "main",
      branchName: proposedRemoteBranchName(),
      ...(packet ? { reviewPacketId: packet.id } : {})
    });
  }

  async function executeReviewAction(label: string, action: () => Promise<ReviewPacket>) {
    if (isReviewRunning) return;
    setIsReviewRunning(true);
    setOrchestratorStatus("syncing");
    setOrchestratorMessage(label);
    try {
      const packet = await action();
      const [snapshot, contents, calls, operations, packets] = await Promise.all([
        fetchOrchestratorSession(createCurrentRuntimeSession(new Date().toISOString())),
        fetchOrchestratorArtifacts(),
        fetchToolCalls(missionId),
        fetchGitOperations(missionId),
        fetchReviewPackets(missionId)
      ]);
      applyRuntimeSessionSnapshot(snapshot);
      setArtifactContents(contents);
      setToolCalls(calls);
      setGitOperations(operations);
      setReviewPackets(packets);
      setActivityFilter("gate");
      setOrchestratorStatus("connected");
      setOrchestratorMessage(packet.summary);
    } catch (error) {
      setOrchestratorStatus("local");
      setOrchestratorMessage(`Review service unavailable: ${formatOrchestratorError(error)}`);
    } finally {
      setIsReviewRunning(false);
    }
  }

  function startReviewPacket() {
    void executeReviewAction("Creating a review packet from local evidence.", () => createReviewPacket({
      missionId,
      taskId: activeTask.id,
      roleId: "tech_lead"
    }));
  }

  function refreshLatestReviewPacket() {
    const packet = reviewPackets[0];
    if (packet) void executeReviewAction("Refreshing the local evidence checklist.", () => refreshReviewPacket(packet.id));
  }

  function runLatestReviewCi() {
    const packet = reviewPackets[0];
    if (packet) void executeReviewAction("Running the seven-command local CI profile.", () => runReviewPacketCi(packet.id));
  }

  function approveReviewRole(roleId: RoleId) {
    const packet = reviewPackets[0];
    if (packet) void executeReviewAction(`Recording ${shortRoleName(roleId)} review.`, () => recordReviewDecision(packet.id, {
      reviewerRoleId: roleId,
      decision: "pass",
      summary: `${shortRoleName(roleId)} verified the attached local evidence.`
    }));
  }

  function generateDeliveryReport() {
    const packet = reviewPackets[0];
    if (packet) void executeReviewAction("Generating an offline Markdown delivery report.", () => createDeliveryPacket(packet.id));
  }

  async function selectMissionHistory(summary: MissionHistorySummary) {
    if (summary.kind === "current") {
      setRecoveredHistory(undefined);
      return;
    }

    setIsHistoryLoading(true);
    try {
      setRecoveredHistory(await fetchMissionHistoryRecord(summary.id));
      setOrchestratorMessage(`Opened archived run ${summary.attempt ?? 1} in read-only recovery.`);
    } catch (error) {
      setOrchestratorMessage(`Mission recovery unavailable: ${formatOrchestratorError(error)}`);
    } finally {
      setIsHistoryLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <LeftNav />
      <main className="workspace">
        <TopHud missionPlan={missionPlan} missionTitle={missionTitle} />
        <MissionIntakePanel
          assumptionCount={missionAssumptions.length}
          assumptionDraft={assumptionDraft}
          commandDraft={commandDraft}
          isAutopilotRunning={isAutopilotRunning}
          isSaving={isMissionSaving}
          lastSavedAt={lastSavedAt}
          lastSavedCommandDraft={lastSavedCommandDraft}
          missionPlan={missionPlan}
          missionState={missionState}
          onAssumptionChange={updateAssumptionDraft}
          onCommandChange={updateCommandDraft}
          onResetDraft={resetMissionDraft}
          onSaveMission={saveMissionIntake}
          savedAssumptionDraft={formatAssumptionDraft(missionAssumptions)}
        />
        <WarRoomSignalPanel
          headline={missionTitle}
          signals={warRoomSignals}
          subline="Live team state, evidence health, and handoff readiness for autonomous local execution."
        />
        <MissionHistoryPanel
          history={missionHistory}
          isLoading={isHistoryLoading}
          onSelect={selectMissionHistory}
          selectedHistoryId={recoveredHistory?.id ?? "current"}
        />
        <section className="main-grid" aria-label="HQ and Mission Control">
          <section className="war-room-panel">
            <div className="panel-heading">
              <div>
                <h1>Team AI Agent HQ</h1>
                <p>{missionTitle}</p>
              </div>
              <div className="accuracy-badge" aria-label={`Accuracy score ${accuracy.overall}`}>
                <CheckCircle2 size={16} />
                {accuracy.overall}
              </div>
            </div>
            <PhaseTimeline gateRuns={gateRuns} selectedGateId={selectedGateId} onSelectGate={selectGate} />
            <PixelOfficeScene
              activeRoute={activeRoute}
              agentWorkloads={agentWorkloads}
              roomWorkloads={roomWorkloads}
              selectedRoleId={selectedRoleId}
              selectedRoomId={selectedRoomId}
              onSelectRole={selectRole}
              onSelectRoom={selectRoom}
            />
          </section>
          {recoveredHistory ? (
            <MissionRecoveryInspector history={recoveredHistory} />
          ) : (
          <MissionInspector
            missionController={activeMissionController}
            agentRun={activeAgentRun}
            agentRunEvents={agentRunEvents}
            agentRuntimeInfo={agentRuntimeInfo}
            auditEvents={auditEvents}
            artifactContents={artifactContents}
            artifacts={artifactEvidence}
            activeTask={activeTask}
            missionPlan={missionPlan}
            missionAssumptions={missionAssumptions}
            modelTier={selectedRouting.modelTier}
            onCloseArtifact={() => setSelectedArtifactId("")}
            onSelectArtifact={setSelectedArtifactId}
            onSelectTask={selectTask}
            onCancelAgentRun={cancelActiveAgentRun}
            onCancelMissionController={cancelActiveMissionController}
            onInspectPlan={inspectImplementationPlan}
            onRetryAgentRun={retryActiveAgentRun}
            onRetryMissionController={retryActiveMissionController}
            onBuildCommitPlan={buildCommitPlan}
            onCheckBranchPushPolicy={checkBranchPushPolicy}
            onCheckDraftPrPolicy={checkDraftPrPolicy}
            onCheckGitStatus={checkGitStatus}
            onCheckRemoteEvidence={checkRemoteEvidence}
            onCheckRemoteHealth={checkRemoteHealth}
            onCreateDraftPr={createDraftPr}
            onDraftPullRequest={draftPullRequest}
            onPushRemoteBranch={pushRemoteBranch}
            onApproveReviewRole={approveReviewRole}
            onCreateDeliveryReport={generateDeliveryReport}
            onCreateReviewPacket={startReviewPacket}
            onRefreshReviewPacket={refreshLatestReviewPacket}
            onRunReviewCi={runLatestReviewCi}
            onRunTypecheck={runTypecheckEvidence}
            selectedActiveRole={selectedActiveRole}
            activeRoute={activeRoute}
            selectedArtifactId={selectedArtifactId}
            selectedGate={selectedGate}
            selectedGateRun={selectedGateRun}
            selectedRaci={selectedRaci}
            selectedRole={selectedRoleId}
            selectedRoomId={selectedRoomId}
            runtimeKind={selectedRouting.runtimeKind}
            taskRuns={taskRuns}
            tasks={missionTasks}
            toolCalls={toolCalls}
            toolPolicy={toolPolicy}
            automationPolicy={automationPolicy}
            gitOperations={gitOperations}
            gitPolicy={gitPolicy}
            reviewPackets={reviewPackets}
            isToolRunning={isToolRunning}
            isGitRunning={isGitRunning}
            isReviewRunning={isReviewRunning}
          />
          )}
        </section>
        <BottomDock
          activityFilter={activityFilter}
          artifactRecordCount={artifactRecords.length}
          auditEventCount={auditEvents.length}
          events={filteredActivity}
          isAutopilotRunning={isAutopilotRunning}
          lastSavedAt={lastSavedAt}
          onFilterChange={setActivityFilter}
          onRunAutopilot={runAutopilotStep}
          missionPlan={missionPlan}
          missionState={missionState}
          orchestratorMessage={orchestratorMessage}
          orchestratorStatus={orchestratorStatus}
          agentRuntimeInfo={agentRuntimeInfo}
        />
      </main>
    </div>
  );
}

function PhaseTimeline({
  gateRuns,
  selectedGateId,
  onSelectGate
}: {
  gateRuns: Record<QualityGateId, GateRun>;
  selectedGateId: QualityGateId;
  onSelectGate: (gateId: QualityGateId) => void;
}) {
  return (
    <div className="phase-timeline" aria-label="Mission phase timeline">
      {phaseVisuals.map((phase) => {
        const run = gateRuns[phase.gateId];
        return (
          <button
            className={selectedGateId === phase.gateId ? "phase-step is-selected" : "phase-step"}
            key={phase.phase}
            onClick={() => onSelectGate(phase.gateId)}
            type="button"
            aria-pressed={selectedGateId === phase.gateId}
            title={`${phase.label}: ${gateStatusLabel[run.status]}`}
          >
            <div className={`phase-dot status-${run.status}`}>{phaseVisuals.indexOf(phase) + 1}</div>
            <span>{phase.short}</span>
          </button>
        );
      })}
    </div>
  );
}

function PixelOfficeScene({
  activeRoute,
  agentWorkloads,
  roomWorkloads,
  selectedRoleId,
  selectedRoomId,
  onSelectRole,
  onSelectRoom
}: {
  activeRoute: WorkflowRoute;
  agentWorkloads: Partial<Record<RoleId, AgentWorkload>>;
  roomWorkloads: Record<DepartmentId, RoomWorkload>;
  selectedRoleId: RoleId;
  selectedRoomId: DepartmentId;
  onSelectRole: (role: ActiveRole) => void;
  onSelectRoom: (department: DepartmentId) => void;
}) {
  return (
    <div className="office-scene" aria-label="Pixel strategy office map">
      <div className="map-board">
        <MapTiles />
        <div className="map-corridor corridor-horizontal" aria-hidden="true" />
        <div className="map-corridor corridor-vertical" aria-hidden="true" />
        <WorkflowRouteLayer activeRoute={activeRoute} />
        {(Object.keys(roomPlacements) as DepartmentId[]).map((department) => {
          const placement = roomPlacements[department];
          const meta = departmentMeta[department];
          const workload = roomWorkloads[department];
          return (
            <button
              className={`office-room room-${meta.tone}${selectedRoomId === department ? " is-selected" : ""}${workload.active > 0 ? " is-busy" : ""}${workload.blocked > 0 ? " has-blocker" : ""}`}
              key={department}
              onClick={() => onSelectRoom(department)}
              style={{
                left: `${placement.x}%`,
                top: `${placement.y}%`,
                width: `${placement.w}%`,
                height: `${placement.h}%`
              }}
              type="button"
              aria-pressed={selectedRoomId === department}
              aria-label={`${meta.title} room ${meta.status}`}
            >
              <div className="room-header">
                <meta.icon size={14} />
                <strong>{meta.title}</strong>
              </div>
              <span className="room-status">{meta.status}</span>
              {workload.active + workload.queued + workload.blocked > 0 ? (
                <div
                  className="room-workload"
                  aria-label={`${workload.active} active tasks, ${workload.queued} queued tasks, ${workload.blocked} blocked tasks`}
                >
                  {workload.active > 0 ? (
                    <span className="workload-chip is-active" title={`${workload.active} active tasks`}>
                      A{workload.active}
                    </span>
                  ) : null}
                  {workload.queued > 0 ? (
                    <span className="workload-chip is-queued" title={`${workload.queued} queued tasks`}>
                      Q{workload.queued}
                    </span>
                  ) : null}
                  {workload.blocked > 0 ? (
                    <span className="workload-chip is-blocked" title={`${workload.blocked} blocked tasks`}>
                      B{workload.blocked}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <PixelDesks count={department === "engineering" ? 6 : department === "qa" ? 4 : 3} />
              <RoomFixture department={department} />
              <RoomDecor department={department} />
            </button>
          );
        })}
        <div className="map-door door-product" aria-hidden="true" />
        <div className="map-door door-engineering" aria-hidden="true" />
        <div className="map-door door-qa" aria-hidden="true" />
        <div className="map-door door-devops" aria-hidden="true" />
        <WorkflowRunner route={activeRoute} />
        {activeRoles.map((role) => (
          <AgentSprite
            workload={agentWorkloads[role.roleId]}
            isSelected={selectedRoleId === role.roleId}
            key={role.roleId}
            onSelect={() => onSelectRole(role)}
            role={role}
          />
        ))}
      </div>
    </div>
  );
}

function WorkflowRouteLayer({ activeRoute }: { activeRoute: WorkflowRoute }) {
  const activePath = routePath(activeRoute);

  return (
    <div className="workflow-route-layer" aria-label={`Active route ${activeRoute.label}`}>
      <svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className="route-line route-shadow" d={activePath} pathLength={100} />
        <path className="route-line is-active" d={activePath} pathLength={100} />
        <path className="route-line-pulse" d={activePath} pathLength={100} />
      </svg>
      <span
        className="route-node route-node-start"
        style={{ left: `${activeRoute.start.x}%`, top: `${activeRoute.start.y}%` }}
      />
      <span
        className="route-node route-node-end"
        style={{ left: `${activeRoute.end.x}%`, top: `${activeRoute.end.y}%` }}
      />
      <div className="route-status-card" style={{ left: `${activeRoute.mid.x}%`, top: `${activeRoute.mid.y}%` }}>
        <span>{activeRoute.token}</span>
        <strong>{activeRoute.label}</strong>
      </div>
    </div>
  );
}

function WorkflowRunner({ route }: { route: WorkflowRoute }) {
  const runnerStyle: WorkflowRunnerStyle = {
    "--route-start-x": `${route.start.x}%`,
    "--route-start-y": `${route.start.y}%`,
    "--route-mid-x": `${route.mid.x}%`,
    "--route-mid-y": `${route.mid.y}%`,
    "--route-end-x": `${route.end.x}%`,
    "--route-end-y": `${route.end.y}%`
  };

  const initials = shortRoleName(route.toRoleId)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="workflow-runner" style={runnerStyle} aria-hidden="true">
      <span className="workflow-runner-shadow" />
      <span className="workflow-runner-body">{initials}</span>
      <span className="workflow-runner-token">{route.token}</span>
    </div>
  );
}

function routePath(route: WorkflowRoute): string {
  return `M ${route.start.x} ${route.start.y} C ${route.mid.x} ${route.start.y}, ${route.mid.x} ${route.end.y}, ${route.end.x} ${route.end.y}`;
}

function MapTiles() {
  return (
    <div className="map-tiles" aria-hidden="true">
      {mapTiles.map((tile) => (
        <span className={`map-tile tile-${tile.tone}`} key={tile.id} />
      ))}
    </div>
  );
}

function PixelDesks({ count }: { count: number }) {
  return (
    <div className="pixel-desks" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function RoomFixture({ department }: { department: DepartmentId }) {
  const fixturesByDepartment: Record<DepartmentId, string[]> = {
    executive: ["briefing-table", "strategy-board"],
    product: ["kanban", "research-desk"],
    design: ["design-board", "palette-rack"],
    engineering: ["code-wall", "repo-terminal", "build-rack"],
    qa: ["test-rig", "defect-board"],
    devops: ["server-stack", "deploy-console"],
    operations: ["doc-shelf", "report-desk"]
  };

  return (
    <div className="room-fixtures" aria-hidden="true">
      {fixturesByDepartment[department].map((fixture) => (
        <span className={`room-fixture fixture-${fixture}`} key={fixture} />
      ))}
    </div>
  );
}

function RoomDecor({ department }: { department: DepartmentId }) {
  const decorByDepartment: Record<DepartmentId, string[]> = {
    executive: ["pixel-rug", "tiny-plant", "goal-screen"],
    product: ["sticky-wall", "coffee-mug", "roadmap-cards"],
    design: ["color-swatches", "draft-table", "lightbox"],
    engineering: ["terminal-glow", "cable-trace", "code-crates"],
    qa: ["checklist-stack", "scope-lens", "test-lights"],
    devops: ["server-lights", "pipe-run", "alert-console"],
    operations: ["paper-stack", "archive-boxes", "report-screen"]
  };

  return (
    <div className="room-decor" aria-hidden="true">
      {decorByDepartment[department].map((decor) => (
        <span className={`decor-pixel decor-${decor}`} key={decor} />
      ))}
    </div>
  );
}

function AgentSprite({
  role,
  workload,
  isSelected,
  onSelect
}: {
  role: ActiveRole;
  workload: AgentWorkload | undefined;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const spriteStyle: AgentSpriteStyle = {
    left: `${role.x}%`,
    top: `${role.y}%`,
    "--walk-x": `${role.walkX}px`,
    "--walk-y": `${role.walkY}px`,
    "--walk-duration": `${role.walkDuration}s`,
    "--walk-delay": `${role.walkDelay}s`
  };

  const initials = roleName(role.roleId)
    .replace(" Agent", "")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <button
      className={`agent-sprite status-${role.status}${isSelected ? " is-selected" : ""}`}
      onClick={onSelect}
      style={spriteStyle}
      type="button"
      aria-pressed={isSelected}
      aria-label={`${roleName(role.roleId)} ${role.task}`}
    >
      <span className="sprite-patrol-lane" aria-hidden="true" />
      <span className="sprite-runner">
        <span className="sprite-shadow" />
        <span className="sprite-body">
          <span className="sprite-face" aria-hidden="true" />
          <span className="sprite-initials">{initials}</span>
          <span className="sprite-feet" aria-hidden="true" />
        </span>
        {workload && workload.active + workload.queued + workload.blocked > 0 ? (
          <span className={workload.blocked > 0 ? "agent-task-badge is-blocked" : "agent-task-badge"}>
            {workload.active || workload.queued || workload.blocked}
          </span>
        ) : null}
        <span className="sprite-label">{role.roleId.replaceAll("_", " ")}</span>
      </span>
    </button>
  );
}

function MissionInspector({
  missionController,
  agentRun,
  agentRunEvents,
  agentRuntimeInfo,
  auditEvents,
  artifactContents,
  artifacts,
  activeRoute,
  activeTask,
  gitOperations,
  gitPolicy,
  isGitRunning,
  isReviewRunning,
  isToolRunning,
  missionAssumptions,
  missionPlan,
  selectedRole,
  selectedActiveRole,
  selectedRoomId,
  selectedRaci,
  selectedGate,
  selectedGateRun,
  selectedArtifactId,
  runtimeKind,
  modelTier,
  tasks,
  taskRuns,
  toolCalls,
  toolPolicy,
  automationPolicy,
  reviewPackets,
  onApproveReviewRole,
  onBuildCommitPlan,
  onCheckBranchPushPolicy,
  onCheckDraftPrPolicy,
  onCheckGitStatus,
  onCheckRemoteEvidence,
  onCheckRemoteHealth,
  onCreateDraftPr,
  onDraftPullRequest,
  onPushRemoteBranch,
  onCreateDeliveryReport,
  onCreateReviewPacket,
  onRefreshReviewPacket,
  onRunReviewCi,
  onSelectArtifact,
  onSelectTask,
  onCancelAgentRun,
  onCancelMissionController,
  onInspectPlan,
  onRetryAgentRun,
  onRetryMissionController,
  onRunTypecheck,
  onCloseArtifact
}: {
  missionController: MissionControllerRecord | undefined;
  agentRun: AgentRunRecord | undefined;
  agentRunEvents: readonly AgentRunEvent[];
  agentRuntimeInfo: AgentRuntimeInfo;
  auditEvents: readonly RuntimeAuditEvent[];
  artifactContents: readonly RuntimeArtifactContent[];
  artifacts: readonly ArtifactEvidence[];
  activeRoute: WorkflowRoute;
  activeTask: MissionTask;
  gitOperations: readonly GitOperationRecord[];
  gitPolicy: GitPolicySnapshot;
  isGitRunning: boolean;
  isReviewRunning: boolean;
  isToolRunning: boolean;
  automationPolicy: AutomationPolicySnapshot;
  missionAssumptions: readonly AssumptionRecord[];
  missionPlan: ReturnType<typeof parseMissionCommand>;
  selectedRole: RoleId;
  selectedActiveRole: ActiveRole | undefined;
  selectedRoomId: DepartmentId;
  selectedRaci: { accountable: RoleId; responsible: readonly RoleId[] };
  selectedGate: { id: QualityGateId; name: string; minimumScore: number; verifierRoleIds: readonly RoleId[]; passCriteria: readonly string[] };
  selectedGateRun: GateRun;
  selectedArtifactId: string;
  runtimeKind: string;
  modelTier: string;
  tasks: readonly MissionTask[];
  taskRuns: Record<string, TaskRunStatus>;
  toolCalls: readonly ToolCallRecord[];
  toolPolicy: ToolPolicySnapshot;
  reviewPackets: readonly ReviewPacket[];
  onApproveReviewRole: (roleId: RoleId) => void;
  onBuildCommitPlan: () => void | Promise<void>;
  onCheckBranchPushPolicy: () => void | Promise<void>;
  onCheckDraftPrPolicy: () => void | Promise<void>;
  onCheckGitStatus: () => void | Promise<void>;
  onCheckRemoteEvidence: () => void | Promise<void>;
  onCheckRemoteHealth: () => void | Promise<void>;
  onCreateDraftPr: () => void | Promise<void>;
  onDraftPullRequest: () => void | Promise<void>;
  onPushRemoteBranch: () => void | Promise<void>;
  onCreateDeliveryReport: () => void | Promise<void>;
  onCreateReviewPacket: () => void | Promise<void>;
  onRefreshReviewPacket: () => void | Promise<void>;
  onRunReviewCi: () => void | Promise<void>;
  onSelectArtifact: (artifactId: string) => void;
  onSelectTask: (taskId: string) => void;
  onCancelAgentRun: () => void | Promise<void>;
  onCancelMissionController: () => void | Promise<void>;
  onInspectPlan: () => void | Promise<void>;
  onRetryAgentRun: () => void | Promise<void>;
  onRetryMissionController: () => void | Promise<void>;
  onRunTypecheck: () => void | Promise<void>;
  onCloseArtifact: () => void;
}) {
  const [evidenceSourceFilter, setEvidenceSourceFilter] = useState<EvidenceSourceFilter>("real");
  const [evidenceStatusFilter, setEvidenceStatusFilter] = useState<EvidenceStatusFilter>("all");
  const prioritizedArtifactContents = useMemo(
    () => [...artifactContents].sort(compareArtifactContent),
    [artifactContents]
  );
  const visibleArtifactContents = useMemo(
    () => filterArtifactContent(prioritizedArtifactContents, evidenceSourceFilter, evidenceStatusFilter),
    [evidenceSourceFilter, evidenceStatusFilter, prioritizedArtifactContents]
  );
  const ollamaLearningCandidates = useMemo(
    () => createOllamaLearningCandidates(prioritizedArtifactContents),
    [prioritizedArtifactContents]
  );
  const commandOutputSummaries = useMemo(
    () => createCommandOutputSummaries(toolCalls, gitOperations, toolPolicy, gitPolicy),
    [gitOperations, gitPolicy, toolCalls, toolPolicy]
  );
  const automationEvidence = useMemo(
    () => createAutomationEvidence({
      artifactContents,
      gitOperations,
      gitPolicy,
      missionController,
      reviewPackets
    }),
    [artifactContents, gitOperations, gitPolicy, missionController, reviewPackets]
  );
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId);
  const selectedArtifactContent =
    prioritizedArtifactContents.find((content) => content.artifactId === selectedArtifactId)
      ?? visibleArtifactContents[0]
      ?? prioritizedArtifactContents[0];
  const selectedRoomMeta = departmentMeta[selectedRoomId];
  const currentTask = selectedActiveRole?.task ?? roleDefinition(selectedRole).responsibilities[0] ?? "Coordinate role output";

  return (
    <aside className="inspector" aria-label="Mission inspector">
      <div className="inspector-header">
        <div>
          <span>Selected role</span>
          <h2>{roleName(selectedRole)}</h2>
        </div>
        <ShieldCheck size={22} />
      </div>
      <div className="role-card">
        <div className="role-card-row">
          <span>Runtime</span>
          <strong>{runtimeKind.replaceAll("_", " ")}</strong>
        </div>
        <div className="role-card-row">
          <span>Model tier</span>
          <strong>{modelTier}</strong>
        </div>
        <div className="role-card-row">
          <span>Room</span>
          <strong>{selectedRoomMeta.title}</strong>
        </div>
        <div className="role-task">
          <span>Current task</span>
          <strong>{currentTask}</strong>
        </div>
      </div>
      <MissionControllerCard
        controller={missionController}
        onCancel={onCancelMissionController}
        onRetry={onRetryMissionController}
      />
      <RemoteHandoffExecutionCard
        auditEvents={auditEvents}
        gitOperations={gitOperations}
      />
      <AutomationPolicyCard
        evidence={automationEvidence}
        policy={automationPolicy}
      />
      <AgentRunCard
        events={agentRunEvents}
        onCancel={onCancelAgentRun}
        onRetry={onRetryAgentRun}
        run={agentRun}
        runtimeInfo={agentRuntimeInfo}
      />
      <ToolEvidenceCard
        calls={toolCalls}
        isRunning={isToolRunning}
        onInspectPlan={onInspectPlan}
        onRunTypecheck={onRunTypecheck}
        policy={toolPolicy}
      />
      <GitIntegrationCard
        isRunning={isGitRunning}
        onBuildCommitPlan={onBuildCommitPlan}
        onCheckBranchPushPolicy={onCheckBranchPushPolicy}
        onCheckDraftPrPolicy={onCheckDraftPrPolicy}
        onCheckStatus={onCheckGitStatus}
        onCheckRemoteEvidence={onCheckRemoteEvidence}
        onCheckRemoteHealth={onCheckRemoteHealth}
        onCreateDraftPr={onCreateDraftPr}
        onDraftPullRequest={onDraftPullRequest}
        onPushRemoteBranch={onPushRemoteBranch}
        operations={gitOperations}
        policy={gitPolicy}
      />
      <ReviewPacketCard
        isRunning={isReviewRunning}
        onApproveRole={onApproveReviewRole}
        onCreate={onCreateReviewPacket}
        onCreateDelivery={onCreateDeliveryReport}
        onRefresh={onRefreshReviewPacket}
        onRunCi={onRunReviewCi}
        packet={reviewPackets[0]}
      />
      <EvidenceInspectorCard
        contents={visibleArtifactContents}
        onSelectArtifact={onSelectArtifact}
        selectedArtifactId={selectedArtifactId}
        sourceFilter={evidenceSourceFilter}
        statusFilter={evidenceStatusFilter}
        totalCount={prioritizedArtifactContents.length}
        onSourceFilterChange={setEvidenceSourceFilter}
        onStatusFilterChange={setEvidenceStatusFilter}
      />
      <CommandOutputSummaryCard summaries={commandOutputSummaries} />
      <OllamaLearningCard
        candidates={ollamaLearningCandidates}
        runtimeInfo={agentRuntimeInfo}
      />
      <section className="command-plan-card" aria-label="Parsed mission command plan">
        <div className="section-title">
          <Command size={16} />
          <h3>Command Plan</h3>
        </div>
        <div className="plan-score-row">
          <span>{missionPlan.autonomyMode.replaceAll("_", " ")}</span>
          <strong>{missionPlan.confidence}%</strong>
        </div>
        <p>{missionPlan.summary}</p>
        <div className="capability-strip" aria-label="Detected capabilities">
          {missionPlan.detectedCapabilities.slice(0, 4).map((capability) => (
            <span key={capability.id}>{capability.label}</span>
          ))}
        </div>
        {missionPlan.missingInputs.length > 0 ? (
          <div className="missing-inputs" aria-label="Missing mission setup inputs">
            {missionPlan.missingInputs.slice(0, 3).map((input) => (
              <span key={input}>{input}</span>
            ))}
          </div>
        ) : null}
      </section>
      <section className="gate-card">
        <div className="section-title">
          <ClipboardCheck size={16} />
          <h3>{selectedGate.name}</h3>
        </div>
        <div className={`gate-score status-${selectedGateRun.status}`}>
          <span>{gateStatusLabel[selectedGateRun.status]}</span>
          <strong>{selectedGateRun.score || selectedGate.minimumScore}</strong>
        </div>
        <p className="gate-note">{selectedGateRun.note}</p>
        <div className="verifier-strip" aria-label="Gate verifiers">
          {selectedGate.verifierRoleIds.slice(0, 4).map((roleId) => (
            <span key={roleId}>{shortRoleName(roleId)}</span>
          ))}
        </div>
        <ul>
          {selectedGate.passCriteria.slice(0, 3).map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      </section>
      <section className="handoff-card" aria-label="Active workflow handoff">
        <div className="section-title">
          <GitBranch size={16} />
          <h3>Active Handoff</h3>
        </div>
        <div className="handoff-route">
          <span>{shortRoleName(activeRoute.fromRoleId)}</span>
          <ChevronRight size={14} />
          <strong>{shortRoleName(activeRoute.toRoleId)}</strong>
        </div>
        <p>{activeRoute.summary}</p>
      </section>
      <TaskGraphCard
        activeTaskId={activeTask.id}
        onSelectTask={onSelectTask}
        taskRuns={taskRuns}
        tasks={tasks}
      />
      <section className="assumption-card">
        <div className="section-title">
          <AlertTriangle size={16} />
          <h3>Assumption Log</h3>
        </div>
        {missionAssumptions.length > 0 ? (
          <div className="assumption-list">
            {missionAssumptions.slice(0, 4).map((assumption) => (
              <article className="assumption-item" key={assumption.id}>
                <p>{assumption.assumption}</p>
                <div className="assumption-meta">
                  <span>{assumption.ambiguityClass}</span>
                  <strong>{assumption.confidence}% confidence</strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="assumption-empty">No assumptions saved for this mission.</p>
        )}
      </section>
      <section className="artifact-list">
        <div className="section-title">
          <Archive size={16} />
          <h3>Evidence links</h3>
        </div>
        {artifacts.map((artifact) => (
          <button
            className={selectedArtifactId === artifact.id ? "is-selected" : ""}
            type="button"
            key={artifact.id}
            onClick={() => onSelectArtifact(artifact.id)}
            aria-pressed={selectedArtifactId === artifact.id}
          >
            <FileText size={14} />
            <span>{artifact.title}</span>
            <strong className={`artifact-status status-${artifact.status}`}>{artifactStatusLabel[artifact.status]}</strong>
          </button>
        ))}
      </section>
      {selectedArtifact ? (
        <section className="artifact-preview" aria-live="polite">
          <div className="artifact-preview-header">
            <div>
              <span>{selectedArtifact.type.replaceAll("_", " ")}</span>
              <h3>{selectedArtifact.title}</h3>
            </div>
            <button type="button" onClick={onCloseArtifact} aria-label="Close artifact preview">
              <X size={14} />
            </button>
          </div>
          <p>{selectedArtifact.summary}</p>
          <div className="artifact-meta">
            <span>{shortRoleName(selectedArtifact.ownerRoleId)}</span>
            <strong>{artifactStatusLabel[selectedArtifact.status]}</strong>
          </div>
          <div className="evidence-stack">
            {selectedArtifact.evidence.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
      ) : null}
      <ArtifactMemoryCard content={selectedArtifactContent} />
      <div className="raci-strip" aria-label="RACI assignment">
        <span>Accountable: {shortRoleName(selectedRaci.accountable)}</span>
        <strong>{selectedRaci.responsible.slice(0, 3).map(shortRoleName).join(" + ")}</strong>
      </div>
    </aside>
  );
}

function createAutomationEvidence({
  artifactContents,
  gitOperations,
  gitPolicy,
  missionController,
  reviewPackets
}: {
  artifactContents: readonly RuntimeArtifactContent[];
  gitOperations: readonly GitOperationRecord[];
  gitPolicy: GitPolicySnapshot;
  missionController: MissionControllerRecord | undefined;
  reviewPackets: readonly ReviewPacket[];
}): AutomationEvidenceContext {
  const latestReviewPacket = reviewPackets[0];
  const latestRemoteEvidence = gitOperations.find((operation) => operation.result?.remoteEvidence)?.result?.remoteEvidence;
  const latestWorktree = gitOperations.find((operation) => operation.result?.worktree)?.result?.worktree;
  const reviewedDelivery = Boolean(latestReviewPacket?.status === "delivered" && latestReviewPacket.deliveryArtifactContentId);
  const reviewerApproval = Boolean(
    latestReviewPacket &&
    latestReviewPacket.requiredReviewerRoleIds.length > 0 &&
    latestReviewPacket.requiredReviewerRoleIds.every((roleId) =>
      latestReviewPacket.reviews.some((review) => review.reviewerRoleId === roleId && review.decision === "pass")
    )
  );
  const rollbackPlan = artifactContents.some((content) =>
    isRealArtifactContent(content) &&
    `${content.summary}\n${content.markdown}`.toLowerCase().includes("rollback")
  );

  return {
    policy_switch_enabled: gitPolicy.allowRemotePush || gitPolicy.allowPullRequestCreate,
    connector_policy_present: gitPolicy.allowRemotePush || gitPolicy.allowPullRequestCreate,
    reviewed_delivery: reviewedDelivery,
    passing_local_ci: latestReviewPacket?.ciRun?.status === "passed",
    reviewer_approval: reviewerApproval,
    remote_branch_current: latestRemoteEvidence?.publicationState === "published_current",
    draft_pr_open: latestRemoteEvidence?.pullRequest.state === "open",
    rollback_plan: rollbackPlan,
    staging_smoke_passed: false,
    production_approval: false,
    bounded_retry_budget: Boolean(
      missionController &&
      ["blocked", "failed", "cancelled"].includes(missionController.status) &&
      missionController.attempt < missionController.maxAttempts
    ),
    no_secret_material: latestWorktree ? !latestWorktree.hasDeniedChanges : false
  };
}

const missionControllerStages: readonly MissionControllerStage[] = [
  "planning",
  "tool_evidence",
  "git_evidence",
  "review_packet",
  "local_ci",
  "reviewers",
  "delivery",
  "handoff_policy"
];

function MissionControllerCard({
  controller,
  onCancel,
  onRetry
}: {
  controller: MissionControllerRecord | undefined;
  onCancel: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
}) {
  if (!controller) {
    return (
      <section className="mission-controller-card" aria-label="Autonomous mission controller">
        <div className="section-title">
          <Zap size={16} />
          <h3>Mission Controller</h3>
        </div>
        <p>Run the mission once to advance planning, evidence, review, CI, and delivery automatically.</p>
      </section>
    );
  }

  const latestResults = new Map(
    controller.stageResults
      .filter((item) => item.attempt === controller.attempt)
      .map((item) => [item.stage, item])
  );
  const guidance = createMissionControllerGuidance(controller);

  return (
    <section className="mission-controller-card" aria-label="Autonomous mission controller">
      <div className="controller-heading">
        <div className="section-title">
          <Zap size={16} />
          <h3>Mission Controller</h3>
        </div>
        <span className={`controller-status status-${controller.status}`}>{controller.status}</span>
      </div>
      <div className="controller-current-stage">
        <span>Current stage</span>
        <strong>{controller.currentStage.replaceAll("_", " ")}</strong>
        <em>Attempt {controller.attempt}/{controller.maxAttempts}</em>
      </div>
      <ol className="controller-stage-list">
        {missionControllerStages.map((stage) => {
          const result = latestResults.get(stage);
          const state = result?.status ?? (stage === controller.currentStage && !isTerminalMissionController(controller.status) ? "running" : "waiting");
          return (
            <li className={`status-${state}`} key={stage} title={result?.summary}>
              {state === "completed" ? <CheckCircle2 size={12} /> : state === "blocked" || state === "failed" ? <AlertTriangle size={12} /> : <span aria-hidden="true" />}
              <strong>{stage.replaceAll("_", " ")}</strong>
              <em>{state}</em>
            </li>
          );
        })}
      </ol>
      {controller.reviewerResults.length > 0 ? (
        <div className="controller-reviewers" aria-label="Local reviewer agent results">
          {controller.reviewerResults.map((result) => (
            <span className={`status-${result.decision}`} key={result.reviewerRoleId} title={`${result.provider}: ${result.summary}`}>
              {shortRoleName(result.reviewerRoleId)} {result.decision}
            </span>
          ))}
        </div>
      ) : null}
      {controller.stopReason ? (
        <p className="controller-stop-reason"><AlertTriangle size={13} /> {controller.stopReason.message}</p>
      ) : null}
      {controller.automationDecisions?.length ? (
        <AutomationDecisionSummary decisions={controller.automationDecisions} title="Handoff policy decisions" />
      ) : null}
      <HardeningGuidanceList guidance={guidance} />
      <div className="controller-actions">
        {!isTerminalMissionController(controller.status) ? (
          <button type="button" onClick={() => void onCancel()}><Square size={12} /> Cancel mission</button>
        ) : null}
        {["blocked", "failed", "cancelled"].includes(controller.status) && controller.attempt < controller.maxAttempts ? (
          <button type="button" onClick={() => void onRetry()}><RotateCcw size={12} /> Retry mission</button>
        ) : null}
      </div>
    </section>
  );
}

function AgentRunCard({
  events,
  onCancel,
  onRetry,
  run,
  runtimeInfo
}: {
  events: readonly AgentRunEvent[];
  onCancel: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  run: AgentRunRecord | undefined;
  runtimeInfo: AgentRuntimeInfo;
}) {
  if (!run) {
    const guidance = createAgentRuntimeGuidance(runtimeInfo);

    return (
      <section className="agent-run-card" aria-label="Local agent runtime">
        <div className="section-title">
          <Cpu size={16} />
          <h3>Local Agent Runtime</h3>
        </div>
        <div className={`agent-runtime-state ${runtimeInfo.activeProvider === "ollama" ? "is-ready" : "is-fallback"}`}>
          <strong>{runtimeInfo.activeProvider === "ollama" ? "Ollama ready" : "Deterministic fallback"}</strong>
          <span>{runtimeInfo.model}</span>
        </div>
        <p>{runtimeInfo.message}</p>
        <HardeningGuidanceList guidance={guidance} />
      </section>
    );
  }

  const terminal = isTerminalAgentRun(run.status);
  const verificationScore = run.verification ? calculateAccuracyScore(run.verification.scores).overall : undefined;
  const latestEvent = events.at(-1);
  const runSummary = latestEvent?.summary
    ?? run.errorSummary
    ?? (run.verification && verificationScore !== undefined
      ? `${run.verification.decision === "pass" ? "Planning passed" : "Planning stopped"} at ${verificationScore}/100 after ${run.attempt} attempt${run.attempt === 1 ? "" : "s"}.`
      : "Waiting for the first persisted run event.");
  const guidance = createAgentRuntimeGuidance(runtimeInfo, run);

  return (
    <section className="agent-run-card" aria-label="Active local agent run" aria-live="polite">
      <div className="agent-run-heading">
        <div className="section-title">
          <Cpu size={16} />
          <h3>Local Agent Run</h3>
        </div>
        <span className={`agent-run-status status-${run.status}`}>{agentRunStatusLabel[run.status]}</span>
      </div>
      <div className="agent-run-facts">
        <span><strong>{run.provider === "ollama" ? "Ollama" : "Deterministic"}</strong> provider</span>
        <span><strong>{run.model}</strong> model</span>
        <span><strong>{run.attempt}</strong> attempt</span>
        <span><strong>{run.usage.inputTokens + run.usage.outputTokens}</strong> tokens</span>
      </div>
      <p>{runSummary}</p>
      {verificationScore !== undefined ? (
        <div className="verification-result">
          <span>{run.verification?.decision}</span>
          <strong>{verificationScore}/100</strong>
        </div>
      ) : null}
      {run.verification?.defects.length ? (
        <ul className="run-defects">
          {run.verification.defects.slice(0, 3).map((defect) => (
            <li key={`${defect.severity}-${defect.summary}`}>{defect.severity}: {defect.summary}</li>
          ))}
        </ul>
      ) : null}
      <HardeningGuidanceList guidance={guidance} />
      <div className="agent-run-actions">
        {!terminal ? (
          <button type="button" onClick={() => void onCancel()}>
            <Square size={13} /> Cancel run
          </button>
        ) : null}
        {terminal && run.status !== "completed" ? (
          <button type="button" onClick={() => void onRetry()}>
            <RotateCcw size={13} /> Retry run
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ToolEvidenceCard({
  calls,
  isRunning,
  onInspectPlan,
  onRunTypecheck,
  policy
}: {
  calls: readonly ToolCallRecord[];
  isRunning: boolean;
  onInspectPlan: () => void | Promise<void>;
  onRunTypecheck: () => void | Promise<void>;
  policy: ToolPolicySnapshot;
}) {
  const latestCalls = calls.slice(0, 3);
  const workspaceLabel = formatWorkspaceLabel(policy.workspaceRoot);

  return (
    <section className="tool-evidence-card" aria-label="Local tool runner evidence">
      <div className="section-title">
        <Command size={16} />
        <h3>Local Tool Runner</h3>
      </div>
      <div className="tool-policy-row">
        <span>{workspaceLabel}</span>
        <strong>{policy.allowFileWrite ? "Local write on" : "Read only"}</strong>
      </div>
      <div className="tool-policy-facts" aria-label="Tool policy summary">
        <span>{policy.allowFileRead ? "Read allowed" : "Read off"}</span>
        <span>{policy.allowTestCommand ? "Tests allowed" : "Tests off"}</span>
        <span>{Math.round(policy.timeoutMs / 1000)}s timeout</span>
      </div>
      <div className="tool-actions">
        <button type="button" disabled={isRunning || !policy.allowFileRead} onClick={() => void onInspectPlan()}>
          <FileText size={13} /> Inspect plan
        </button>
        <button type="button" disabled={isRunning || !policy.allowTestCommand} onClick={() => void onRunTypecheck()}>
          <TestTube2 size={13} /> Run typecheck
        </button>
      </div>
      {latestCalls.length > 0 ? (
        <div className="tool-call-list">
          {latestCalls.map((call) => (
            <article className={`tool-call-row status-${call.status}`} key={call.id}>
              <span>{toolCallKindLabel[call.kind]}</span>
              <strong>{call.targetPath ?? call.command ?? call.kind}</strong>
              <em>{toolCallStatusLabel[call.status]}</em>
            </article>
          ))}
        </div>
      ) : (
        <p className="tool-empty">No local tool evidence recorded yet.</p>
      )}
    </section>
  );
}

function GitIntegrationCard({
  isRunning,
  onBuildCommitPlan,
  onCheckBranchPushPolicy,
  onCheckDraftPrPolicy,
  onCheckStatus,
  onCheckRemoteEvidence,
  onCheckRemoteHealth,
  onCreateDraftPr,
  onDraftPullRequest,
  onPushRemoteBranch,
  operations,
  policy
}: {
  isRunning: boolean;
  onBuildCommitPlan: () => void | Promise<void>;
  onCheckBranchPushPolicy: () => void | Promise<void>;
  onCheckDraftPrPolicy: () => void | Promise<void>;
  onCheckStatus: () => void | Promise<void>;
  onCheckRemoteEvidence: () => void | Promise<void>;
  onCheckRemoteHealth: () => void | Promise<void>;
  onCreateDraftPr: () => void | Promise<void>;
  onDraftPullRequest: () => void | Promise<void>;
  onPushRemoteBranch: () => void | Promise<void>;
  operations: readonly GitOperationRecord[];
  policy: GitPolicySnapshot;
}) {
  const latestOperations = operations.slice(0, 4);
  const latestWorktree = operations.find((operation) => operation.result?.worktree)?.result?.worktree;
  const latestRemote = operations.find((operation) => operation.result?.remoteHealth)?.result?.remoteHealth;
  const latestRemoteEvidence = operations.find((operation) => operation.result?.remoteEvidence)?.result?.remoteEvidence;
  const latestRemotePolicy = operations.find((operation) => operation.result?.remoteMutationPolicy)?.result?.remoteMutationPolicy;
  const workspaceLabel = formatWorkspaceLabel(policy.workspaceRoot);
  const guidance = createGitHardeningGuidance(policy, operations);

  return (
    <section className="git-integration-card" aria-label="Local Git integration">
      <div className="section-title">
        <GitBranch size={16} />
        <h3>Git Integration</h3>
      </div>
      <div className="git-policy-row">
        <span>{latestRemote ? latestRemote.repository : latestWorktree ? latestWorktree.branch : workspaceLabel}</span>
        <strong>{latestRemote ? (latestRemote.access === "ok" ? "Remote ok" : "Remote blocked") : policy.allowGitCommit ? "Commit on" : "Commit off"}</strong>
      </div>
      <div className="git-policy-facts" aria-label="Git policy summary">
        <span>{policy.allowGitRead ? "Read allowed" : "Read off"}</span>
        <span>{policy.allowRemoteRead ? "Remote read on" : "Remote read off"}</span>
        <span>{policy.allowRemotePush ? "Remote push on" : "Remote push off"}</span>
        <span>{policy.allowPullRequestCreate ? "PR create on" : "PR draft only"}</span>
        <span>{latestRemote ? `${latestRemote.currentBranch} -> ${latestRemote.defaultBranch}` : latestWorktree ? `${latestWorktree.files.length} changed` : "Not checked"}</span>
      </div>
      {latestRemotePolicy ? (
        <div className="git-remote-policy" aria-label="Remote mutation policy summary">
          <span>{latestRemotePolicy.allowed ? "Remote policy ready" : "Remote policy blocked"}</span>
          <strong>{latestRemotePolicy.branchName}</strong>
          <em>{latestRemotePolicy.reviewedDeliveryPresent ? "Delivery reviewed" : "Delivery required"}</em>
          <small>Force push off, deletion off</small>
        </div>
      ) : null}
      {latestRemoteEvidence ? (
        <div className="git-remote-evidence" aria-label="Remote publication evidence summary">
          <span>{latestRemoteEvidence.publicationState.replaceAll("_", " ")}</span>
          <strong>{latestRemoteEvidence.branchName}</strong>
          <em>{latestRemoteEvidence.pullRequest.state === "none" ? "No PR" : `${latestRemoteEvidence.pullRequest.draft ? "Draft " : ""}PR ${latestRemoteEvidence.pullRequest.state}`}</em>
          <em>{latestRemoteEvidence.checks.state === "none" ? "Checks unavailable" : `Checks ${latestRemoteEvidence.checks.state}`}</em>
          <small>{latestRemoteEvidence.retryable ? `Retry: ${latestRemoteEvidence.retryReason}` : "Merge off, deploy off, force push off, deletion off"}</small>
        </div>
      ) : null}
      <HardeningGuidanceList guidance={guidance} />
      <div className="git-actions">
        <button type="button" disabled={isRunning || !policy.allowGitRead} onClick={() => void onCheckStatus()}>
          <GitBranch size={13} /> Check status
        </button>
        <button type="button" disabled={isRunning || !policy.allowGitRead || !policy.allowRemoteRead} onClick={() => void onCheckRemoteHealth()}>
          <CloudCog size={13} /> Check remote
        </button>
        <button type="button" disabled={isRunning || !policy.allowGitRead || !policy.allowRemoteRead} onClick={() => void onCheckRemoteEvidence()}>
          <Search size={13} /> {latestRemoteEvidence?.retryable ? "Retry evidence" : "Check evidence"}
        </button>
        <button type="button" disabled={isRunning || !policy.allowGitRead} onClick={() => void onBuildCommitPlan()}>
          <ClipboardCheck size={13} /> Build commit plan
        </button>
        <button type="button" disabled={isRunning || !policy.allowGitRead} onClick={() => void onDraftPullRequest()}>
          <FileText size={13} /> Draft PR
        </button>
        <button type="button" disabled={isRunning || !policy.allowGitRead || !policy.allowRemoteRead} onClick={() => void onCheckBranchPushPolicy()}>
          <Upload size={13} /> Check push
        </button>
        <button type="button" disabled={isRunning || !policy.allowGitRead || !policy.allowRemoteRead} onClick={() => void onCheckDraftPrPolicy()}>
          <ClipboardCheck size={13} /> Check PR policy
        </button>
        <button type="button" disabled={isRunning || !policy.allowGitRead || !policy.allowRemoteRead || !policy.allowRemotePush} onClick={() => void onPushRemoteBranch()}>
          <Upload size={13} /> Push branch
        </button>
        <button type="button" disabled={isRunning || !policy.allowGitRead || !policy.allowRemoteRead || !policy.allowPullRequestCreate} onClick={() => void onCreateDraftPr()}>
          <FileText size={13} /> Create draft PR
        </button>
      </div>
      {latestOperations.length > 0 ? (
        <div className="git-operation-list">
          {latestOperations.map((operation) => (
            <article className={`git-operation-row status-${operation.status}`} key={operation.id}>
              <span>{gitOperationKindLabel[operation.kind]}</span>
              <strong>{gitOperationSummary(operation)}</strong>
              <em>{gitOperationStatusLabel[operation.status]}</em>
            </article>
          ))}
        </div>
      ) : (
        <p className="git-empty">No local Git evidence recorded yet.</p>
      )}
    </section>
  );
}

function ReviewPacketCard({
  isRunning,
  onApproveRole,
  onCreate,
  onCreateDelivery,
  onRefresh,
  onRunCi,
  packet
}: {
  isRunning: boolean;
  onApproveRole: (roleId: RoleId) => void;
  onCreate: () => void | Promise<void>;
  onCreateDelivery: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onRunCi: () => void | Promise<void>;
  packet: ReviewPacket | undefined;
}) {
  if (!packet) {
    return (
      <section className="review-packet-card" aria-label="Review and delivery packet">
        <div className="section-title">
          <ClipboardCheck size={16} />
          <h3>Review Packet</h3>
        </div>
        <p className="review-empty">Collect file, test, Git, and reviewer evidence into one local handoff.</p>
        <button className="review-primary-action" type="button" disabled={isRunning} onClick={() => void onCreate()}>
          <ClipboardCheck size={13} /> Create review packet
        </button>
      </section>
    );
  }

  const passedRequirements = packet.requirements.filter((item) => item.status === "pass").length;
  const approvedReviewers = new Set(packet.reviews.filter((item) => item.decision === "pass").map((item) => item.reviewerRoleId));
  const guidance = createReviewHardeningGuidance(packet);

  return (
    <section className="review-packet-card" aria-label="Review and delivery packet">
      <div className="review-packet-heading">
        <div className="section-title">
          <ClipboardCheck size={16} />
          <h3>Review Packet</h3>
        </div>
        <span className={`review-status status-${packet.status}`}>{packet.status.replaceAll("_", " ")}</span>
      </div>
      <div className="review-score-row">
        <strong>{passedRequirements}/{packet.requirements.length} checks</strong>
        <span>
          {packet.evidence.toolCallIds.length + packet.evidence.gitOperationIds.length} evidence ref
          {packet.evidence.toolCallIds.length + packet.evidence.gitOperationIds.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="review-summary">{packet.summary}</p>
      <HardeningGuidanceList guidance={guidance} />
      <div className="review-requirements" aria-label="Evidence completeness checklist">
        {packet.requirements.map((item) => (
          <article className={`requirement-row status-${item.status}`} key={item.id} title={item.summary}>
            {item.status === "pass" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            <strong>{item.label}</strong>
            <span>{item.status}</span>
          </article>
        ))}
      </div>
      <div className="reviewer-actions" aria-label="Required reviewer approvals">
        {packet.requiredReviewerRoleIds.map((roleId) => (
          <button
            className={approvedReviewers.has(roleId) ? "is-approved" : ""}
            disabled={isRunning || approvedReviewers.has(roleId)}
            key={roleId}
            onClick={() => onApproveRole(roleId)}
            type="button"
          >
            {approvedReviewers.has(roleId) ? <CheckCircle2 size={12} /> : <ShieldCheck size={12} />}
            {shortRoleName(roleId)}
          </button>
        ))}
      </div>
      {packet.ciRun ? (
        <details className="ci-matrix">
          <summary>
            Local CI: {packet.ciRun.status} ({packet.ciRun.commands.filter((item) => item.status === "passed").length}/{packet.ciRun.commands.length})
          </summary>
          {packet.ciRun.commands.map((item) => (
            <div className={`ci-command-row status-${item.status}`} key={item.command}>
              <span>{item.status}</span>
              <code>{item.command.replace("npm run ", "")}</code>
            </div>
          ))}
        </details>
      ) : null}
      <div className="review-actions">
        <button type="button" disabled={isRunning} onClick={() => void onRefresh()}>
          <RotateCcw size={13} /> Refresh evidence
        </button>
        <button type="button" disabled={isRunning} onClick={() => void onRunCi()}>
          <TestTube2 size={13} /> Run local CI
        </button>
        <button type="button" disabled={isRunning} onClick={() => void onCreateDelivery()}>
          <FileText size={13} /> Build delivery report
        </button>
      </div>
    </section>
  );
}

function isTerminalAgentRun(status: AgentRunRecord["status"]): boolean {
  return ["completed", "blocked", "failed", "cancelled"].includes(status);
}

function isTerminalMissionController(status: MissionControllerRecord["status"]): boolean {
  return ["completed", "blocked", "failed", "cancelled"].includes(status);
}
