import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createEmptyToolCallStoreSnapshot,
  restoreToolCallStoreSnapshot
} from "../../../packages/shared/src/index.js";
import type { ToolCallRecord, ToolCallStoreSnapshot } from "../../../packages/shared/src/index.js";

export interface ToolCallStore {
  readSnapshot(): Promise<ToolCallStoreSnapshot>;
  writeSnapshot(snapshot: ToolCallStoreSnapshot): Promise<ToolCallStoreSnapshot>;
  listToolCalls(missionId?: string): Promise<ToolCallRecord[]>;
  findToolCall(toolCallId: string): Promise<ToolCallRecord | undefined>;
  upsertToolCall(toolCall: ToolCallRecord): Promise<ToolCallRecord>;
  reset(): Promise<ToolCallStoreSnapshot>;
}

export class FileToolCallStore implements ToolCallStore {
  constructor(private readonly filePath: string) {}

  async readSnapshot(): Promise<ToolCallStoreSnapshot> {
    try {
      return restoreToolCallStoreSnapshot(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch {
      return this.writeSnapshot(createEmptyToolCallStoreSnapshot());
    }
  }

  async writeSnapshot(snapshot: ToolCallStoreSnapshot): Promise<ToolCallStoreSnapshot> {
    const normalized = restoreToolCallStoreSnapshot(snapshot);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
    return normalized;
  }

  async listToolCalls(missionId?: string): Promise<ToolCallRecord[]> {
    const calls = [...(await this.readSnapshot()).toolCalls];
    return calls.filter((call) => !missionId || call.missionId === missionId);
  }

  async findToolCall(toolCallId: string): Promise<ToolCallRecord | undefined> {
    return (await this.listToolCalls()).find((call) => call.id === toolCallId);
  }

  async upsertToolCall(toolCall: ToolCallRecord): Promise<ToolCallRecord> {
    const snapshot = await this.readSnapshot();
    await this.writeSnapshot({
      ...snapshot,
      toolCalls: [toolCall, ...snapshot.toolCalls.filter((item) => item.id !== toolCall.id)].slice(0, 200)
    });
    return toolCall;
  }

  async reset(): Promise<ToolCallStoreSnapshot> {
    return this.writeSnapshot(createEmptyToolCallStoreSnapshot());
  }
}
