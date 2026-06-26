import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createEmptyMissionHistoryStoreSnapshot,
  restoreMissionHistoryStoreSnapshot
} from "../../../packages/workflow/src/index.js";
import type {
  MissionHistoryRecord,
  MissionHistoryStoreSnapshot
} from "../../../packages/workflow/src/index.js";

export interface MissionHistoryStore {
  readSnapshot(): Promise<MissionHistoryStoreSnapshot>;
  writeSnapshot(snapshot: MissionHistoryStoreSnapshot): Promise<MissionHistoryStoreSnapshot>;
  listRecords(): Promise<MissionHistoryRecord[]>;
  findRecord(historyId: string): Promise<MissionHistoryRecord | undefined>;
  upsertRecord(record: MissionHistoryRecord): Promise<MissionHistoryRecord>;
}

export class FileMissionHistoryStore implements MissionHistoryStore {
  constructor(private readonly filePath: string) {}

  async readSnapshot(): Promise<MissionHistoryStoreSnapshot> {
    try {
      return restoreMissionHistoryStoreSnapshot(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch {
      return this.writeSnapshot(createEmptyMissionHistoryStoreSnapshot());
    }
  }

  async writeSnapshot(snapshot: MissionHistoryStoreSnapshot): Promise<MissionHistoryStoreSnapshot> {
    const normalized = restoreMissionHistoryStoreSnapshot(snapshot);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
    return normalized;
  }

  async listRecords(): Promise<MissionHistoryRecord[]> {
    return [...(await this.readSnapshot()).records];
  }

  async findRecord(historyId: string): Promise<MissionHistoryRecord | undefined> {
    return (await this.listRecords()).find((record) => record.id === historyId);
  }

  async upsertRecord(record: MissionHistoryRecord): Promise<MissionHistoryRecord> {
    const existing = await this.findRecord(record.id);
    if (existing) return existing;
    const snapshot = await this.readSnapshot();
    await this.writeSnapshot({
      ...snapshot,
      records: [record, ...snapshot.records.filter((item) => item.id !== record.id)].slice(0, 100)
    });
    return record;
  }
}
