import type { MissionControllerRecord } from "../../../packages/shared/src/index.js";
import {
  createMissionHistorySummary
} from "../../../packages/workflow/src/index.js";
import type {
  MissionHistoryArchiveReason,
  MissionHistoryRecord,
  MissionHistoryStatus,
  MissionHistorySummary
} from "../../../packages/workflow/src/index.js";
import type { AgentRunStore } from "./agent-run-store.js";
import type { ArtifactContentStore } from "./artifact-content-store.js";
import type { GitOperationStore } from "./git-operation-store.js";
import type { MissionControllerStore } from "./mission-controller-store.js";
import type { MissionHistoryStore } from "./mission-history-store.js";
import type { MissionStore } from "./mission-store.js";
import type { ReviewPacketStore } from "./review-packet-store.js";
import type { ToolCallStore } from "./tool-call-store.js";

type MissionHistoryServiceOptions = {
  historyStore: MissionHistoryStore;
  missionStore: MissionStore;
  controllerStore: MissionControllerStore;
  runStore: AgentRunStore;
  toolCallStore: ToolCallStore;
  gitOperationStore: GitOperationStore;
  reviewPacketStore: ReviewPacketStore;
  artifactStore: ArtifactContentStore;
  now?: () => string;
};

export class MissionHistoryService {
  private readonly now: () => string;

  constructor(private readonly options: MissionHistoryServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async listHistory(): Promise<MissionHistorySummary[]> {
    const current = await this.buildCurrentRecord();
    const archived = await this.options.historyStore.listRecords();
    return [
      createMissionHistorySummary(current),
      ...archived
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(createMissionHistorySummary)
    ];
  }

  async getHistory(historyId: string): Promise<MissionHistoryRecord | undefined> {
    return historyId === "current" ? this.buildCurrentRecord() : this.options.historyStore.findRecord(historyId);
  }

  async captureController(
    controller: MissionControllerRecord,
    archiveReason: MissionHistoryArchiveReason = "controller_terminal"
  ): Promise<MissionHistoryRecord> {
    const record = await this.buildRecord(controller, "archived", archiveReason);
    return this.options.historyStore.upsertRecord(record);
  }

  async captureCurrent(archiveReason: MissionHistoryArchiveReason): Promise<MissionHistoryRecord> {
    const session = await this.options.missionStore.readSession();
    const controller = (await this.options.controllerStore.listControllers(session.missionId))[0];
    const record = await this.buildRecord(controller, "archived", archiveReason);
    return this.options.historyStore.upsertRecord(record);
  }

  private async buildCurrentRecord(): Promise<MissionHistoryRecord> {
    const session = await this.options.missionStore.readSession();
    const controller = (await this.options.controllerStore.listControllers(session.missionId))[0];
    return this.buildRecord(controller, "current");
  }

  private async buildRecord(
    controller: MissionControllerRecord | undefined,
    kind: MissionHistoryRecord["kind"],
    archiveReason?: MissionHistoryArchiveReason
  ): Promise<MissionHistoryRecord> {
    const session = await this.options.missionStore.readSession();
    const missionId = controller?.missionId ?? session.missionId;
    const [runSnapshot, toolCalls, gitOperations, reviewPackets, artifactContents] = await Promise.all([
      this.options.runStore.readSnapshot(),
      this.options.toolCallStore.listToolCalls(missionId),
      this.options.gitOperationStore.listOperations(missionId),
      this.options.reviewPacketStore.listPackets(missionId),
      this.options.artifactStore.readArtifacts()
    ]);
    const agentRuns = runSnapshot.runs.filter((run) => run.missionId === missionId);
    const runIds = new Set(agentRuns.map((run) => run.id));
    const archivedAt = kind === "archived" ? this.now() : undefined;
    const id = kind === "current"
      ? "current"
      : controller
        ? `history-${controller.id}-attempt-${controller.attempt}`
        : `history-${missionId}-session-${session.savedAt.replace(/[^0-9]/g, "")}`;

    return {
      schemaVersion: 1,
      id,
      kind,
      missionId,
      title: session.missionState.title || session.missionPlan.title,
      command: controller?.command ?? session.commandDraft,
      status: historyStatus(controller, session.missionState.status),
      ...(archiveReason ? { archiveReason } : {}),
      ...(controller ? { controller } : {}),
      session,
      agentRuns,
      agentRunEvents: runSnapshot.events.filter((event) => runIds.has(event.runId)),
      toolCalls,
      gitOperations,
      reviewPackets,
      artifactContents: artifactContents.filter((artifact) => artifact.missionId === missionId),
      createdAt: controller?.createdAt ?? session.missionState.createdAt,
      updatedAt: controller?.updatedAt ?? session.missionState.updatedAt,
      ...(archivedAt ? { archivedAt } : {})
    };
  }
}

function historyStatus(
  controller: MissionControllerRecord | undefined,
  missionStatus: "draft" | "saved" | "running" | "blocked" | "delivered"
): MissionHistoryStatus {
  if (!controller) return missionStatus;
  if (controller.status === "completed") return "delivered";
  if (controller.status === "cancelled") return "cancelled";
  if (controller.status === "failed") return "failed";
  if (controller.status === "blocked") return "blocked";
  return "running";
}
