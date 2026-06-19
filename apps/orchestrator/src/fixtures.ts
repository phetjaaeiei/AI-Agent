import {
  DEFAULT_MISSION_COMMAND,
  createRuntimeArtifactContent,
  createRuntimeArtifactRecord,
  createRuntimeAuditEvent,
  createRuntimeSessionSnapshot,
  parseMissionCommand
} from "../../../packages/workflow/src/index.js";
import type {
  RuntimeActivityEvent,
  RuntimeArtifactContent,
  RuntimeArtifactRecord,
  RuntimeAuditEvent,
  RuntimeAutopilotAction,
  RuntimeGateRun,
  RuntimeRouteDefinition,
  RuntimeSessionSnapshot,
  RuntimeTaskDefinition,
  RuntimeTaskStatus
} from "../../../packages/workflow/src/index.js";
import type { QualityGateId } from "../../../packages/shared/src/index.js";

export const ORCHESTRATOR_MISSION_ID = "bench_multi_role_full_feature";

export const orchestratorRoutes: RuntimeRouteDefinition[] = [
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
    token: "AC"
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
    token: "UI"
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
    token: "QA"
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
    token: "STG"
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
    token: "LOG"
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
    token: "OK"
  }
];

export const orchestratorTasks: RuntimeTaskDefinition[] = [
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

export const orchestratorActions: RuntimeAutopilotAction[] = [
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
  }
];

const initialActivityEvents: RuntimeActivityEvent[] = [
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
  }
];

const initialGateRuns: Record<QualityGateId, RuntimeGateRun> = {
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

const artifactSeed = [
  {
    artifactId: "art-prd",
    taskId: "task-executive-signoff",
    title: "PRD Draft",
    summary: "Scope, success metrics, and out-of-scope decisions for the sales analytics mission.",
    ownerRoleId: "product_manager",
    gateId: "planning_gate",
    status: "reviewing"
  },
  {
    artifactId: "art-acceptance",
    taskId: "task-acceptance-handoff",
    title: "Acceptance Matrix",
    summary: "Traceability from user request to filters, CSV export, QA scenarios, and staging smoke checks.",
    ownerRoleId: "lead_ba",
    gateId: "technical_design_gate",
    status: "verified"
  },
  {
    artifactId: "art-technical-plan",
    taskId: "task-dispatch-ui-build",
    title: "Technical Plan",
    summary: "Module boundaries, API contract check, state model, test strategy, and rollback path.",
    ownerRoleId: "tech_lead",
    gateId: "implementation_gate",
    status: "reviewing"
  },
  {
    artifactId: "art-qa-report",
    taskId: "task-send-build-evidence",
    title: "QA Report",
    summary: "Manual and automated coverage plan for filters, empty states, export, accessibility, and smoke testing.",
    ownerRoleId: "qa_lead",
    gateId: "qa_gate",
    status: "draft"
  },
  {
    artifactId: "art-deploy-log",
    taskId: "task-qa-to-staging",
    title: "Deployment Log",
    summary: "Staging deployment target, environment assumptions, smoke check, and rollback readiness.",
    ownerRoleId: "devops_lead",
    gateId: "release_gate",
    status: "draft"
  }
] as const;

export function createDefaultOrchestratorArtifactContents(createdAt = new Date().toISOString()): RuntimeArtifactContent[] {
  const missionPlan = parseMissionCommand(DEFAULT_MISSION_COMMAND);

  return artifactSeed.map((artifact, index) => {
    const task = orchestratorTasks.find((item) => item.id === artifact.taskId) ?? orchestratorTasks[0]!;
    const route = orchestratorRoutes.find((item) => item.id === task.routeId) ?? orchestratorRoutes[0]!;
    const artifactRecord = createRuntimeArtifactRecord({
      ...artifact,
      version: index + 1,
      createdAt
    });

    return createRuntimeArtifactContent({
      missionId: ORCHESTRATOR_MISSION_ID,
      artifactRecord,
      missionPlan,
      route,
      task,
      createdAt,
      source: "orchestrator"
    });
  });
}

export function createDefaultOrchestratorSession(savedAt = new Date().toISOString()): RuntimeSessionSnapshot {
  const taskRuns = Object.fromEntries(orchestratorTasks.map((task) => [task.id, task.initialStatus])) as Record<string, RuntimeTaskStatus>;
  const artifactRecords: RuntimeArtifactRecord[] = artifactSeed.map((artifact, index) =>
    createRuntimeArtifactRecord({
      ...artifact,
      version: index + 1,
      createdAt: savedAt
    })
  );
  const auditEvents: RuntimeAuditEvent[] = [
    createRuntimeAuditEvent({
      id: "audit-orchestrator-session-created",
      actorRoleId: "chief_of_staff",
      action: "mission_saved",
      summary: "Default orchestrator mission session created.",
      severity: "info",
      entityId: ORCHESTRATOR_MISSION_ID,
      createdAt: savedAt
    })
  ];

  return createRuntimeSessionSnapshot({
    missionId: ORCHESTRATOR_MISSION_ID,
    commandDraft: DEFAULT_MISSION_COMMAND,
    missionPlan: parseMissionCommand(DEFAULT_MISSION_COMMAND),
    runtime: {
      gateRuns: initialGateRuns,
      taskRuns,
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
    artifactRecords,
    auditEvents,
    savedAt
  });
}
