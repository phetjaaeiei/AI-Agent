import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createEmptyAgentRunStoreSnapshot,
  restoreAgentRunStoreSnapshot
} from "../../../packages/shared/src/index.js";
import type {
  AgentRunEvent,
  AgentRunRecord,
  AgentRunStoreSnapshot
} from "../../../packages/shared/src/index.js";

export interface AgentRunStore {
  readSnapshot(): Promise<AgentRunStoreSnapshot>;
  writeSnapshot(snapshot: AgentRunStoreSnapshot): Promise<AgentRunStoreSnapshot>;
  listRuns(missionId?: string): Promise<AgentRunRecord[]>;
  findRun(runId: string): Promise<AgentRunRecord | undefined>;
  findByIdempotencyKey(key: string): Promise<AgentRunRecord | undefined>;
  upsertRun(run: AgentRunRecord): Promise<AgentRunRecord>;
  listEvents(runId: string): Promise<AgentRunEvent[]>;
  appendEvent(event: AgentRunEvent): Promise<AgentRunEvent>;
  reset(): Promise<AgentRunStoreSnapshot>;
}

export class FileAgentRunStore implements AgentRunStore {
  constructor(private readonly filePath: string) {}

  async readSnapshot(): Promise<AgentRunStoreSnapshot> {
    try {
      return restoreAgentRunStoreSnapshot(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch {
      return this.writeSnapshot(createEmptyAgentRunStoreSnapshot());
    }
  }

  async writeSnapshot(snapshot: AgentRunStoreSnapshot): Promise<AgentRunStoreSnapshot> {
    const normalized = restoreAgentRunStoreSnapshot(snapshot);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
    return normalized;
  }

  async listRuns(missionId?: string): Promise<AgentRunRecord[]> {
    const runs = [...(await this.readSnapshot()).runs];
    return runs.filter((run) => !missionId || run.missionId === missionId);
  }

  async findRun(runId: string): Promise<AgentRunRecord | undefined> {
    return (await this.listRuns()).find((run) => run.id === runId);
  }

  async findByIdempotencyKey(key: string): Promise<AgentRunRecord | undefined> {
    return (await this.listRuns()).find((run) => run.idempotencyKey === key);
  }

  async upsertRun(run: AgentRunRecord): Promise<AgentRunRecord> {
    const snapshot = await this.readSnapshot();
    await this.writeSnapshot({
      ...snapshot,
      runs: [run, ...snapshot.runs.filter((item) => item.id !== run.id)].slice(0, 100)
    });
    return run;
  }

  async listEvents(runId: string): Promise<AgentRunEvent[]> {
    return (await this.readSnapshot()).events
      .filter((event) => event.runId === runId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  async appendEvent(event: AgentRunEvent): Promise<AgentRunEvent> {
    const snapshot = await this.readSnapshot();
    await this.writeSnapshot({ ...snapshot, events: [...snapshot.events, event].slice(-1000) });
    return event;
  }

  async reset(): Promise<AgentRunStoreSnapshot> {
    return this.writeSnapshot(createEmptyAgentRunStoreSnapshot());
  }
}
