import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { restoreRuntimeSessionSnapshot } from "../../../packages/workflow/src/index.js";
import type { RuntimeSessionSnapshot } from "../../../packages/workflow/src/index.js";

export type MissionStore = {
  readSession(): Promise<RuntimeSessionSnapshot>;
  writeSession(snapshot: RuntimeSessionSnapshot): Promise<RuntimeSessionSnapshot>;
  resetSession(): Promise<RuntimeSessionSnapshot>;
};

export class FileMissionStore implements MissionStore {
  constructor(
    private readonly filePath: string,
    private readonly createDefaultSession: () => RuntimeSessionSnapshot
  ) {}

  async readSession(): Promise<RuntimeSessionSnapshot> {
    const defaults = this.createDefaultSession();

    try {
      const raw = await readFile(this.filePath, "utf8");
      const restore = restoreRuntimeSessionSnapshot(JSON.parse(raw), defaults);

      if (restore.ok) {
        return restore.snapshot;
      }

      return this.writeSession(defaults);
    } catch {
      return this.writeSession(defaults);
    }
  }

  async writeSession(snapshot: RuntimeSessionSnapshot): Promise<RuntimeSessionSnapshot> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return snapshot;
  }

  async resetSession(): Promise<RuntimeSessionSnapshot> {
    return this.writeSession(this.createDefaultSession());
  }
}
