import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createEmptyMissionControllerStoreSnapshot,
  restoreMissionControllerStoreSnapshot
} from "../../../packages/shared/src/index.js";
import type {
  MissionControllerRecord,
  MissionControllerStoreSnapshot
} from "../../../packages/shared/src/index.js";

export interface MissionControllerStore {
  readSnapshot(): Promise<MissionControllerStoreSnapshot>;
  writeSnapshot(snapshot: MissionControllerStoreSnapshot): Promise<MissionControllerStoreSnapshot>;
  listControllers(missionId?: string): Promise<MissionControllerRecord[]>;
  findController(controllerId: string): Promise<MissionControllerRecord | undefined>;
  findByIdempotencyKey(idempotencyKey: string): Promise<MissionControllerRecord | undefined>;
  upsertController(controller: MissionControllerRecord): Promise<MissionControllerRecord>;
  reset(): Promise<MissionControllerStoreSnapshot>;
}

export class FileMissionControllerStore implements MissionControllerStore {
  constructor(private readonly filePath: string) {}

  async readSnapshot(): Promise<MissionControllerStoreSnapshot> {
    try {
      return restoreMissionControllerStoreSnapshot(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch {
      return this.writeSnapshot(createEmptyMissionControllerStoreSnapshot());
    }
  }

  async writeSnapshot(snapshot: MissionControllerStoreSnapshot): Promise<MissionControllerStoreSnapshot> {
    const normalized = restoreMissionControllerStoreSnapshot(snapshot);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
    return normalized;
  }

  async listControllers(missionId?: string): Promise<MissionControllerRecord[]> {
    return [...(await this.readSnapshot()).controllers].filter((item) => !missionId || item.missionId === missionId);
  }

  async findController(controllerId: string): Promise<MissionControllerRecord | undefined> {
    return (await this.listControllers()).find((item) => item.id === controllerId);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<MissionControllerRecord | undefined> {
    return (await this.listControllers()).find((item) => item.idempotencyKey === idempotencyKey);
  }

  async upsertController(controller: MissionControllerRecord): Promise<MissionControllerRecord> {
    const snapshot = await this.readSnapshot();
    await this.writeSnapshot({
      ...snapshot,
      controllers: [controller, ...snapshot.controllers.filter((item) => item.id !== controller.id)].slice(0, 100)
    });
    return controller;
  }

  async reset(): Promise<MissionControllerStoreSnapshot> {
    return this.writeSnapshot(createEmptyMissionControllerStoreSnapshot());
  }
}
