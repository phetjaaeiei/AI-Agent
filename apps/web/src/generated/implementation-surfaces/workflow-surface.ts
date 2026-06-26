export type GeneratedImplementationSurfaceModule = {
  schemaVersion: 1;
  generatedAt: string;
  source: "mission_controller" | "seed";
  kind: "landing" | "dashboard" | "workflow";
  command: string;
  targetPath: string;
  surface: {
    kind: "landing" | "dashboard" | "workflow";
    eyebrow: string;
    headline: string;
    subheadline: string;
    primaryAction: string;
    secondaryAction: string;
    panels: readonly { label: string; detail: string; tone: "primary" | "neutral" | "success" }[];
  };
};

export const generatedImplementationSurface: GeneratedImplementationSurfaceModule = {
  schemaVersion: 1,
  generatedAt: "2026-06-26T00:00:00.000Z",
  source: "seed",
  kind: "workflow",
  command: "No workflow implementation surface has been generated yet.",
  targetPath: "apps/web/src/generated/implementation-surfaces/workflow-surface.ts",
  surface: {
    kind: "workflow",
    eyebrow: "Workflow preview",
    headline: "Workflow surface waiting",
    subheadline: "A workflow mission can replace this allowlisted module through the implementation patch policy.",
    primaryAction: "Inspect patch",
    secondaryAction: "Check handoff",
    panels: [
      { label: "Implementation", detail: "Waiting for a bounded local patch.", tone: "primary" },
      { label: "Safety", detail: "Waiting for policy evidence.", tone: "neutral" }
    ]
  }
};
