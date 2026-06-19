import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createEmptyReviewPacketStoreSnapshot,
  restoreReviewPacketStoreSnapshot
} from "../../../packages/shared/src/index.js";
import type { ReviewPacket, ReviewPacketStoreSnapshot } from "../../../packages/shared/src/index.js";

export interface ReviewPacketStore {
  readSnapshot(): Promise<ReviewPacketStoreSnapshot>;
  writeSnapshot(snapshot: ReviewPacketStoreSnapshot): Promise<ReviewPacketStoreSnapshot>;
  listPackets(missionId?: string): Promise<ReviewPacket[]>;
  findPacket(packetId: string): Promise<ReviewPacket | undefined>;
  upsertPacket(packet: ReviewPacket): Promise<ReviewPacket>;
  reset(): Promise<ReviewPacketStoreSnapshot>;
}

export class FileReviewPacketStore implements ReviewPacketStore {
  constructor(private readonly filePath: string) {}

  async readSnapshot(): Promise<ReviewPacketStoreSnapshot> {
    try {
      return restoreReviewPacketStoreSnapshot(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch {
      return this.writeSnapshot(createEmptyReviewPacketStoreSnapshot());
    }
  }

  async writeSnapshot(snapshot: ReviewPacketStoreSnapshot): Promise<ReviewPacketStoreSnapshot> {
    const normalized = restoreReviewPacketStoreSnapshot(snapshot);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
    return normalized;
  }

  async listPackets(missionId?: string): Promise<ReviewPacket[]> {
    return [...(await this.readSnapshot()).packets].filter((packet) => !missionId || packet.missionId === missionId);
  }

  async findPacket(packetId: string): Promise<ReviewPacket | undefined> {
    return (await this.listPackets()).find((packet) => packet.id === packetId);
  }

  async upsertPacket(packet: ReviewPacket): Promise<ReviewPacket> {
    const snapshot = await this.readSnapshot();
    await this.writeSnapshot({
      ...snapshot,
      packets: [packet, ...snapshot.packets.filter((item) => item.id !== packet.id)].slice(0, 100)
    });
    return packet;
  }

  async reset(): Promise<ReviewPacketStoreSnapshot> {
    return this.writeSnapshot(createEmptyReviewPacketStoreSnapshot());
  }
}
