import {
  advanceMissionRuntime,
  createRuntimeArtifactContent,
  createRuntimeArtifactRecord,
  createRuntimeAuditEvent,
  createRuntimeMissionState,
  createRuntimeSessionSnapshot,
  parseMissionCommand
} from "../../../packages/workflow/src/index.js";
import type { RuntimeArtifactContent, RuntimeSessionSnapshot } from "../../../packages/workflow/src/index.js";
import type { ArtifactContentStore } from "./artifact-content-store.js";
import { orchestratorActions, orchestratorRoutes, orchestratorTasks } from "./fixtures.js";
import type { MissionStore } from "./mission-store.js";

export type AdvanceMissionInput = {
  commandDraft?: string;
};

export type OrchestratorAdvanceResult = {
  snapshot: RuntimeSessionSnapshot;
  artifactContent: RuntimeArtifactContent;
  advancedTaskId: string;
  activeRouteId: string;
};

export async function advanceStoredMission(
  store: MissionStore,
  artifactStore: ArtifactContentStore,
  input: AdvanceMissionInput,
  now = () => new Date().toISOString()
): Promise<OrchestratorAdvanceResult> {
  const current = await store.readSession();
  const commandDraft = input.commandDraft?.trim() || current.commandDraft;
  const missionPlan = parseMissionCommand(commandDraft);
  const route = orchestratorRoutes[current.runtime.activeRouteIndex] ?? orchestratorRoutes[0]!;
  const task = orchestratorTasks[current.runtime.activeRouteIndex] ?? orchestratorTasks[0]!;
  const createdAt = now();
  const transition = advanceMissionRuntime(current.runtime, {
    routes: orchestratorRoutes,
    tasks: orchestratorTasks,
    actions: orchestratorActions
  });
  const artifactRecord = createRuntimeArtifactRecord({
    artifactId: route.artifactId,
    taskId: task.id,
    title: route.label,
    summary: route.summary,
    ownerRoleId: route.toRoleId,
    gateId: route.gateId,
    status: transition.gateRuns[route.gateId]?.status === "passed" ? "verified" : "reviewing",
    version: current.runtime.autopilotCursor + 1,
    createdAt
  });
  const artifactContent = createRuntimeArtifactContent({
    missionId: current.missionId,
    artifactRecord,
    missionPlan,
    route,
    task,
    createdAt,
    source: "orchestrator"
  });
  const auditEvent = createRuntimeAuditEvent({
    id: `audit-server-autopilot-${current.runtime.autopilotCursor + 1}`,
    actorRoleId: route.toRoleId,
    action: "task_advanced",
    summary: `${route.label} advanced through the orchestrator service.`,
    severity: transition.gateRuns[route.gateId]?.status === "blocked" ? "warning" : "success",
    entityId: task.id,
    createdAt
  });
  const snapshot = createRuntimeSessionSnapshot({
    missionId: current.missionId,
    commandDraft,
    assumptionDraft: current.assumptionDraft,
    missionAssumptions: current.missionAssumptions,
    missionPlan,
    missionState: createRuntimeMissionState({
      commandDraft,
      missionPlan,
      savedAt: createdAt,
      previousState: current.missionState,
      source: "orchestrator",
      status: "saved",
      statusReason: "Orchestrator advanced one mission step."
    }),
    runtime: {
      gateRuns: transition.gateRuns,
      taskRuns: transition.taskRuns,
      activityLog: transition.activityLog,
      activeRouteIndex: transition.activeRouteIndex,
      autopilotCursor: transition.autopilotCursor
    },
    selection: {
      selectedGateId: transition.selectedGateId,
      selectedRoleId: transition.selectedRoleId,
      selectedRoomId: transition.selectedRoomId,
      selectedArtifactId: transition.selectedArtifactId
    },
    artifactRecords: [artifactRecord, ...current.artifactRecords].slice(0, 100),
    auditEvents: [auditEvent, ...current.auditEvents].slice(0, 200),
    savedAt: createdAt
  });

  await store.writeSession(snapshot);
  await artifactStore.appendArtifact(artifactContent);

  return {
    snapshot,
    artifactContent,
    advancedTaskId: task.id,
    activeRouteId: route.id
  };
}
