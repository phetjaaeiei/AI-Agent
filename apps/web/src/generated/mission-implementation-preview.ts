export type MissionImplementationPreviewSection = {
  label: string;
  summary: string;
};

export type MissionImplementationPreview = {
  schemaVersion: 1;
  generatedAt: string;
  source: "mission_controller" | "seed";
  command: string;
  title: string;
  summary: string;
  targetPath: string;
  sections: readonly MissionImplementationPreviewSection[];
};

export const missionImplementationPreview: MissionImplementationPreview = {
  schemaVersion: 1,
  generatedAt: "2026-06-26T00:00:00.000Z",
  source: "seed",
  command: "No mission implementation patch has been generated yet.",
  title: "Waiting for implementation patch",
  summary: "Run a mission to let the controller create the first bounded local code patch.",
  targetPath: "apps/web/src/generated/mission-implementation-preview.ts",
  sections: [
    {
      label: "Patch",
      summary: "The implementation patch stage writes this module through the local tool-runner file_write policy."
    },
    {
      label: "Evidence",
      summary: "The generated file becomes Git diff evidence, review packet input, CI evidence, and delivery report context."
    }
  ]
};
