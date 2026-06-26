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
  kind: "dashboard",
  command: "No dashboard implementation surface has been generated yet.",
  targetPath: "apps/web/src/generated/implementation-surfaces/dashboard-surface.ts",
  surface: {
    kind: "dashboard",
    eyebrow: "Dashboard preview",
    headline: "Dashboard surface waiting",
    subheadline: "A dashboard mission can replace this allowlisted module through the implementation patch policy.",
    primaryAction: "Inspect patch",
    secondaryAction: "Run QA",
    panels: [
      { label: "Data", detail: "Waiting for dashboard content.", tone: "primary" },
      { label: "Tests", detail: "Waiting for local CI evidence.", tone: "neutral" }
    ]
  }
};
