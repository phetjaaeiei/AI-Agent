import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { restoreRuntimeArtifactContents } from "../../../packages/workflow/src/index.js";
import type { RuntimeArtifactContent } from "../../../packages/workflow/src/index.js";

export type ArtifactContentStore = {
  readArtifacts(): Promise<RuntimeArtifactContent[]>;
  writeArtifacts(contents: readonly RuntimeArtifactContent[]): Promise<RuntimeArtifactContent[]>;
  appendArtifact(content: RuntimeArtifactContent): Promise<RuntimeArtifactContent[]>;
  resetArtifacts(): Promise<RuntimeArtifactContent[]>;
};

export class FileArtifactContentStore implements ArtifactContentStore {
  constructor(
    private readonly filePath: string,
    private readonly createDefaultArtifacts: () => RuntimeArtifactContent[]
  ) {}

  async readArtifacts(): Promise<RuntimeArtifactContent[]> {
    const defaults = this.createDefaultArtifacts();

    try {
      const raw = await readFile(this.filePath, "utf8");
      const contents = restoreRuntimeArtifactContents(JSON.parse(raw));

      if (contents.length > 0) {
        return contents;
      }

      return this.writeArtifacts(defaults);
    } catch {
      return this.writeArtifacts(defaults);
    }
  }

  async writeArtifacts(contents: readonly RuntimeArtifactContent[]): Promise<RuntimeArtifactContent[]> {
    const snapshot = [...contents];

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return snapshot;
  }

  async appendArtifact(content: RuntimeArtifactContent): Promise<RuntimeArtifactContent[]> {
    const contents = await this.readArtifacts();
    const nextContents = [content, ...contents.filter((item) => item.id !== content.id)].slice(0, 120);

    return this.writeArtifacts(nextContents);
  }

  async resetArtifacts(): Promise<RuntimeArtifactContent[]> {
    return this.writeArtifacts(this.createDefaultArtifacts());
  }
}
