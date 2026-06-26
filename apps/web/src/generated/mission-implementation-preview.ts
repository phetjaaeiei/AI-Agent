export type MissionImplementationPreviewSection = {
  label: string;
  summary: string;
};

export type MissionImplementationPreviewSurfacePanel = {
  label: string;
  detail: string;
  tone: "primary" | "neutral" | "success";
};

export type MissionImplementationPreviewSurface = {
  kind: "landing" | "dashboard" | "workflow";
  eyebrow: string;
  headline: string;
  subheadline: string;
  primaryAction: string;
  secondaryAction: string;
  panels: readonly MissionImplementationPreviewSurfacePanel[];
};

export type MissionImplementationPreview = {
  schemaVersion: 1;
  generatedAt: string;
  source: "mission_controller" | "seed";
  command: string;
  title: string;
  summary: string;
  targetPath: string;
  surface: MissionImplementationPreviewSurface;
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
  surface: {
    kind: "workflow",
    eyebrow: "Queued preview",
    headline: "Implementation surface will render here",
    subheadline: "The next mission run writes a bounded preview module, then Mission Control keeps that surface visible through review, CI, delivery, and recovery.",
    primaryAction: "Run local agents",
    secondaryAction: "Inspect policy",
    panels: [
      {
        label: "Patch",
        detail: "Waiting for the local file_write stage.",
        tone: "primary"
      },
      {
        label: "Evidence",
        detail: "Git diff, tests, review, and delivery attach after the patch exists.",
        tone: "neutral"
      }
    ]
  },
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
