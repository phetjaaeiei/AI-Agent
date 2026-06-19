import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createEmptyGitOperationStoreSnapshot,
  restoreGitOperationStoreSnapshot
} from "../../../packages/shared/src/index.js";
import type { GitOperationRecord, GitOperationStoreSnapshot } from "../../../packages/shared/src/index.js";

export interface GitOperationStore {
  readSnapshot(): Promise<GitOperationStoreSnapshot>;
  writeSnapshot(snapshot: GitOperationStoreSnapshot): Promise<GitOperationStoreSnapshot>;
  listOperations(missionId?: string): Promise<GitOperationRecord[]>;
  findOperation(operationId: string): Promise<GitOperationRecord | undefined>;
  upsertOperation(operation: GitOperationRecord): Promise<GitOperationRecord>;
  reset(): Promise<GitOperationStoreSnapshot>;
}

export class FileGitOperationStore implements GitOperationStore {
  constructor(private readonly filePath: string) {}

  async readSnapshot(): Promise<GitOperationStoreSnapshot> {
    try {
      return restoreGitOperationStoreSnapshot(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch {
      return this.writeSnapshot(createEmptyGitOperationStoreSnapshot());
    }
  }

  async writeSnapshot(snapshot: GitOperationStoreSnapshot): Promise<GitOperationStoreSnapshot> {
    const normalized = restoreGitOperationStoreSnapshot(snapshot);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
    return normalized;
  }

  async listOperations(missionId?: string): Promise<GitOperationRecord[]> {
    const operations = [...(await this.readSnapshot()).operations];
    return operations.filter((operation) => !missionId || operation.missionId === missionId);
  }

  async findOperation(operationId: string): Promise<GitOperationRecord | undefined> {
    return (await this.listOperations()).find((operation) => operation.id === operationId);
  }

  async upsertOperation(operation: GitOperationRecord): Promise<GitOperationRecord> {
    const snapshot = await this.readSnapshot();
    await this.writeSnapshot({
      ...snapshot,
      operations: [operation, ...snapshot.operations.filter((item) => item.id !== operation.id)].slice(0, 200)
    });
    return operation;
  }

  async reset(): Promise<GitOperationStoreSnapshot> {
    return this.writeSnapshot(createEmptyGitOperationStoreSnapshot());
  }
}
