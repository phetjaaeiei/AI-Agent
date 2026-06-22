import {
  ROLE_IDS,
  OPERATIONAL_MISSION_PHASES
} from "../../dist/packages/shared/src/index.js";
import {
  ROLE_REGISTRY,
  ROLE_SKILL_MATRIX
} from "../../dist/packages/agent-core/src/index.js";
import {
  AGENT_MODEL_ROUTING,
  MODEL_IDS
} from "../../dist/packages/config/src/index.js";
import {
  MISSION_BENCHMARKS,
  PHASE_RACI,
  QUALITY_GATES,
  advanceMissionRuntime,
  calculateAccuracyScore,
  calculateMissionAgentWorkloads,
  calculateMissionRoomWorkloads,
  createAssumptionsFromDraft,
  createMissionHistorySummary,
  createRuntimeArtifactRecord,
  createRuntimeAuditEvent,
  createRuntimeSessionSnapshot,
  createTaskRunMap,
  formatAssumptionDraft,
  getRaciForPhase,
  parseMissionCommand,
  passesQualityGate,
  restoreMissionHistoryStoreSnapshot,
  restoreRuntimeSessionSnapshot
} from "../../dist/packages/workflow/src/index.js";

const failures = [];

const assert = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const unique = (values) => [...new Set(values)];

const roleIds = ROLE_IDS;
const registryIds = ROLE_REGISTRY.map((role) => role.id);
const skillIds = Object.keys(ROLE_SKILL_MATRIX);

assert(registryIds.length === roleIds.length, `Expected ${roleIds.length} role definitions, found ${registryIds.length}.`);
assert(unique(registryIds).length === registryIds.length, "Role registry has duplicate role ids.");

for (const roleId of roleIds) {
  const role = ROLE_REGISTRY.find((entry) => entry.id === roleId);
  const skillProfile = ROLE_SKILL_MATRIX[roleId];
  const routingProfile = AGENT_MODEL_ROUTING[roleId];

  assert(Boolean(role), `Missing role definition for ${roleId}.`);
  assert(Boolean(skillProfile), `Missing skill profile for ${roleId}.`);

  if (role) {
    assert(role.responsibilities.length > 0, `${roleId} must define responsibilities.`);
    assert(role.defaultTools.length > 0, `${roleId} must define at least one default tool.`);
    assert(role.mustNotDo.length > 0, `${roleId} must define boundaries in mustNotDo.`);
    assert(Boolean(role.outputSchemaId), `${roleId} must define outputSchemaId.`);
    assert(Boolean(role.promptTemplateId), `${roleId} must define promptTemplateId.`);
  }

  if (skillProfile) {
    assert(skillProfile.primarySkills.length > 0, `${roleId} must have primary skills at level 4 or 5.`);
    assert(skillProfile.approvalRights.length > 0, `${roleId} must document approval rights.`);
    assert(skillProfile.reviewStrengths.length > 0, `${roleId} must document review strengths.`);
  }

  assert(Boolean(routingProfile), `Missing agent model routing for ${roleId}.`);

  if (routingProfile && role) {
    const knownModels = Object.values(MODEL_IDS);
    assert(knownModels.includes(routingProfile.preferredModel), `${roleId} preferredModel is not in MODEL_IDS.`);
    assert(knownModels.includes(routingProfile.fallbackModel), `${roleId} fallbackModel is not in MODEL_IDS.`);
    assert(routingProfile.requiredTools.length > 0, `${roleId} routing must define required tools.`);
    assert(Boolean(routingProfile.notes), `${roleId} routing must document suitability notes.`);

    for (const toolId of routingProfile.requiredTools) {
      assert(role.defaultTools.includes(toolId), `${roleId} routing requires ${toolId}, but role.defaultTools does not include it.`);
    }

    for (const toolId of routingProfile.forbiddenTools) {
      assert(!routingProfile.requiredTools.includes(toolId), `${roleId} routing both requires and forbids ${toolId}.`);
    }

    if (routingProfile.modelTier === "nano") {
      assert(routingProfile.maxToolRisk === "read", `${roleId} uses nano tier but maxToolRisk is ${routingProfile.maxToolRisk}.`);
    }

    if (routingProfile.maxToolRisk === "deploy_production") {
      assert(routingProfile.modelTier === "frontier", `${roleId} can reach production deploy risk without frontier tier.`);
    }

    if (routingProfile.runtimeKind === "security_verifier") {
      assert(["frontier", "professional"].includes(routingProfile.modelTier), `${roleId} security verifier uses too-small model tier.`);
      assert(routingProfile.autonomy === "verifier", `${roleId} security verifier should use verifier autonomy.`);
    }
  }
}

for (const skillId of skillIds) {
  assert(roleIds.includes(skillId), `Skill matrix contains unknown role ${skillId}.`);
}

for (const routingRoleId of Object.keys(AGENT_MODEL_ROUTING)) {
  assert(roleIds.includes(routingRoleId), `Model routing contains unknown role ${routingRoleId}.`);
}

for (const phase of OPERATIONAL_MISSION_PHASES) {
  const raci = getRaciForPhase(phase);
  assert(Boolean(raci), `Missing RACI for phase ${phase}.`);

  if (raci) {
    assert(raci.responsible.length > 0, `${phase} RACI must have responsible roles.`);
    assert(Boolean(raci.accountable), `${phase} RACI must have an accountable role.`);
  }
}

for (const assignment of PHASE_RACI) {
  const referencedRoles = [
    ...assignment.responsible,
    assignment.accountable,
    ...assignment.consulted,
    ...assignment.informed
  ];

  for (const roleId of referencedRoles) {
    assert(roleIds.includes(roleId), `RACI for ${assignment.phase} references unknown role ${roleId}.`);
  }
}

for (const gate of QUALITY_GATES) {
  assert(gate.minimumScore >= 80 && gate.minimumScore <= 100, `${gate.id} minimumScore should be 80-100.`);
  assert(gate.requiredArtifacts.length > 0, `${gate.id} must require artifacts.`);
  assert(gate.verifierRoleIds.length > 0, `${gate.id} must define verifier roles.`);
  assert(gate.passCriteria.length > 0, `${gate.id} must define pass criteria.`);

  for (const roleId of gate.verifierRoleIds) {
    assert(roleIds.includes(roleId), `${gate.id} references unknown verifier ${roleId}.`);
  }
}

const benchmarkCategories = unique(MISSION_BENCHMARKS.map((benchmark) => benchmark.category));
assert(MISSION_BENCHMARKS.length >= 10, "Expected at least 10 mission benchmarks.");
assert(benchmarkCategories.length >= 10, `Expected 10 benchmark categories, found ${benchmarkCategories.length}.`);

for (const benchmark of MISSION_BENCHMARKS) {
  assert(benchmark.expectedRoles.length > 0, `${benchmark.id} must define expected roles.`);
  assert(benchmark.expectedPhases.length > 0, `${benchmark.id} must define expected phases.`);

  for (const roleId of benchmark.expectedRoles) {
    assert(roleIds.includes(roleId), `${benchmark.id} references unknown role ${roleId}.`);
  }
}

const strongScore = calculateAccuracyScore({
  completeness: 90,
  correctness: 90,
  consistency: 90,
  verifiability: 90,
  riskControl: 90
});
const strictestGate = QUALITY_GATES.find((gate) => gate.minimumScore === 90);
assert(Boolean(strictestGate), "Expected a strict gate with minimumScore 90.");
if (strictestGate) {
  assert(passesQualityGate(strongScore, strictestGate), "Strong score should pass strictest gate.");
}

const parsedCommand = parseMissionCommand("Build a dashboard with filters, API data, CSV export, QA tests, and staging deploy.");
assert(parsedCommand.detectedCapabilities.length >= 5, "Mission command parser should detect multi-role delivery capabilities.");
assert(parsedCommand.recommendedRoleIds.includes("frontend_developer"), "Mission command parser should recommend frontend developer.");
assert(parsedCommand.recommendedRoleIds.includes("backend_developer"), "Mission command parser should recommend backend developer.");
assert(parsedCommand.recommendedRoleIds.includes("automation_qa"), "Mission command parser should recommend automation QA.");
assert(parsedCommand.recommendedRoleIds.includes("devops_lead"), "Mission command parser should recommend DevOps lead.");

const runtimeTasks = [
  {
    id: "task-a",
    title: "Plan work",
    summary: "Plan the mission.",
    routeId: "route-a",
    ownerRoleId: "lead_ba",
    room: "product",
    phase: "planning",
    artifactId: "artifact-a",
    gateId: "technical_design_gate",
    initialStatus: "running",
    priority: "high",
    eta: "2m"
  },
  {
    id: "task-b",
    title: "Build work",
    summary: "Build the mission.",
    routeId: "route-b",
    ownerRoleId: "frontend_developer",
    room: "engineering",
    phase: "implementation",
    artifactId: "artifact-b",
    gateId: "implementation_gate",
    initialStatus: "queued",
    priority: "high",
    eta: "5m"
  }
];
const runtimeTaskRuns = createTaskRunMap(runtimeTasks);
const roomWorkloads = calculateMissionRoomWorkloads(runtimeTasks, runtimeTaskRuns);
const agentWorkloads = calculateMissionAgentWorkloads(runtimeTasks, runtimeTaskRuns);
assert(roomWorkloads.product.active === 1, "Runtime room workload should count active product task.");
assert(roomWorkloads.engineering.queued === 1, "Runtime room workload should count queued engineering task.");
assert(agentWorkloads.lead_ba.active === 1, "Runtime agent workload should count active owner task.");

const advancedRuntime = advanceMissionRuntime(
  {
    gateRuns: {
      planning_gate: {
        gateId: "planning_gate",
        ownerRoleId: "cpo",
        status: "passed",
        score: 86,
        note: "Planning ready.",
        lastUpdated: "10:00"
      },
      technical_design_gate: {
        gateId: "technical_design_gate",
        ownerRoleId: "tech_lead",
        status: "reviewing",
        score: 82,
        note: "Design review.",
        lastUpdated: "10:02"
      },
      implementation_gate: {
        gateId: "implementation_gate",
        ownerRoleId: "tech_lead",
        status: "queued",
        score: 0,
        note: "Implementation waiting.",
        lastUpdated: "10:03"
      },
      qa_gate: {
        gateId: "qa_gate",
        ownerRoleId: "qa_lead",
        status: "queued",
        score: 0,
        note: "QA waiting.",
        lastUpdated: "10:04"
      },
      release_gate: {
        gateId: "release_gate",
        ownerRoleId: "devops_lead",
        status: "blocked",
        score: 52,
        note: "Release waiting.",
        lastUpdated: "10:05"
      },
      final_report_gate: {
        gateId: "final_report_gate",
        ownerRoleId: "technical_writer",
        status: "queued",
        score: 0,
        note: "Report waiting.",
        lastUpdated: "10:06"
      }
    },
    taskRuns: runtimeTaskRuns,
    activityLog: [],
    activeRouteIndex: 0,
    autopilotCursor: 0
  },
  {
    routes: [
      {
        id: "route-a",
        label: "Plan handoff",
        summary: "Send plan to tech lead.",
        fromRoleId: "lead_ba",
        toRoleId: "tech_lead",
        fromRoom: "product",
        toRoom: "engineering",
        artifactId: "artifact-a",
        gateId: "technical_design_gate",
        token: "AC"
      },
      {
        id: "route-b",
        label: "Build handoff",
        summary: "Send plan to frontend developer.",
        fromRoleId: "tech_lead",
        toRoleId: "frontend_developer",
        fromRoom: "engineering",
        toRoom: "engineering",
        artifactId: "artifact-b",
        gateId: "implementation_gate",
        token: "UI"
      }
    ],
    tasks: runtimeTasks,
    actions: [
      {
        gateId: "technical_design_gate",
        roleId: "tech_lead",
        type: "gate",
        title: "Design gate passed",
        summary: "Design evidence accepted.",
        tone: "success",
        time: "10:10",
        status: "passed",
        score: 88,
        note: "Design accepted."
      }
    ]
  }
);
assert(advancedRuntime.taskRuns["task-a"] === "passed", "Runtime transition should pass the active task.");
assert(advancedRuntime.taskRuns["task-b"] === "running", "Runtime transition should activate the next task.");
assert(advancedRuntime.selectedRoleId === "tech_lead", "Runtime transition should select the receiving role.");
assert(advancedRuntime.activityLog.length === 1, "Runtime transition should append one activity event.");

const artifactRecord = createRuntimeArtifactRecord({
  artifactId: "artifact-a",
  taskId: "task-a",
  title: "Acceptance Matrix",
  summary: "Traceability evidence.",
  ownerRoleId: "lead_ba",
  gateId: "technical_design_gate",
  status: "verified",
  version: 1,
  createdAt: "2026-06-18T10:10:00.000Z"
});
const auditEvent = createRuntimeAuditEvent({
  id: "audit-test",
  actorRoleId: "tech_lead",
  action: "task_advanced",
  summary: "Advanced task-a.",
  severity: "success",
  entityId: "task-a",
  createdAt: "2026-06-18T10:11:00.000Z"
});
const missionAssumptions = createAssumptionsFromDraft({
  missionId: "mission-runtime-test",
  draft: "Repository main branch is the implementation baseline.\nStaging credentials are configured outside the session.",
  createdAt: "2026-06-18T10:11:30.000Z"
});
const runtimeSnapshot = createRuntimeSessionSnapshot({
  missionId: "mission-runtime-test",
  commandDraft: parsedCommand.rawCommand,
  assumptionDraft: formatAssumptionDraft(missionAssumptions),
  missionAssumptions,
  missionPlan: parsedCommand,
  runtime: {
    gateRuns: advancedRuntime.gateRuns,
    taskRuns: advancedRuntime.taskRuns,
    activityLog: advancedRuntime.activityLog,
    activeRouteIndex: advancedRuntime.activeRouteIndex,
    autopilotCursor: advancedRuntime.autopilotCursor
  },
  selection: {
    selectedGateId: advancedRuntime.selectedGateId,
    selectedRoleId: advancedRuntime.selectedRoleId,
    selectedRoomId: advancedRuntime.selectedRoomId,
    selectedArtifactId: advancedRuntime.selectedArtifactId
  },
  artifactRecords: [artifactRecord],
  auditEvents: [auditEvent],
  savedAt: "2026-06-18T10:12:00.000Z"
});
const restoredSnapshot = restoreRuntimeSessionSnapshot(JSON.parse(JSON.stringify(runtimeSnapshot)), runtimeSnapshot);
const legacySnapshot = JSON.parse(JSON.stringify(runtimeSnapshot));
delete legacySnapshot.assumptionDraft;
delete legacySnapshot.missionAssumptions;
const restoredLegacySnapshot = restoreRuntimeSessionSnapshot(legacySnapshot, runtimeSnapshot);
const rejectedSnapshot = restoreRuntimeSessionSnapshot({ schemaVersion: 999 }, runtimeSnapshot);
assert(restoredSnapshot.ok, "Runtime session snapshot should restore when schema is valid.");
assert(restoredSnapshot.snapshot.auditEvents.length === 1, "Runtime session snapshot should preserve audit events.");
assert(restoredSnapshot.snapshot.artifactRecords.length === 1, "Runtime session snapshot should preserve artifact records.");
assert(restoredSnapshot.snapshot.missionAssumptions.length === 2, "Runtime session snapshot should preserve mission assumptions.");
assert(restoredSnapshot.snapshot.assumptionDraft.includes("Staging credentials"), "Runtime session snapshot should preserve assumption draft text.");
assert(restoredLegacySnapshot.ok, "Runtime session snapshot should restore legacy snapshots without assumptions.");
assert(restoredLegacySnapshot.snapshot.missionAssumptions.length === 0, "Legacy runtime snapshots should recover with an empty assumption log.");
assert(!rejectedSnapshot.ok, "Runtime session snapshot should reject unsupported schema.");

const missionHistoryRecord = {
  schemaVersion: 1,
  id: "history-mission-runtime-test-session",
  kind: "archived",
  missionId: runtimeSnapshot.missionId,
  title: runtimeSnapshot.missionState.title,
  command: runtimeSnapshot.commandDraft,
  status: "saved",
  archiveReason: "mission_reset",
  session: runtimeSnapshot,
  agentRuns: [],
  agentRunEvents: [],
  toolCalls: [],
  gitOperations: [],
  reviewPackets: [],
  artifactContents: [],
  createdAt: runtimeSnapshot.missionState.createdAt,
  updatedAt: runtimeSnapshot.savedAt,
  archivedAt: runtimeSnapshot.savedAt
};
const restoredHistory = restoreMissionHistoryStoreSnapshot({ schemaVersion: 1, records: [missionHistoryRecord, { schemaVersion: 999 }] });
const historySummary = createMissionHistorySummary(restoredHistory.records[0]);
assert(restoredHistory.records.length === 1, "Mission history restore should reject malformed archive records.");
assert(historySummary.kind === "archived" && historySummary.status === "saved", "Mission history summary should preserve archive state.");
assert(historySummary.artifactCount === 0, "Mission history summary should expose bounded evidence counts.");

if (failures.length > 0) {
  console.error("Foundation verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Foundation verification passed.");
console.log(`Roles: ${ROLE_REGISTRY.length}`);
console.log(`Operational phases with RACI: ${PHASE_RACI.length}`);
console.log(`Quality gates: ${QUALITY_GATES.length}`);
console.log(`Mission benchmarks: ${MISSION_BENCHMARKS.length}`);
console.log(`Agent model routing profiles: ${Object.keys(AGENT_MODEL_ROUTING).length}`);
console.log(`Runtime parser capabilities: ${parsedCommand.detectedCapabilities.length}`);
console.log(`Runtime persisted records: ${runtimeSnapshot.artifactRecords.length + runtimeSnapshot.auditEvents.length + runtimeSnapshot.missionAssumptions.length}`);
