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
  kind: "landing",
  command: "No landing implementation surface has been generated yet.",
  targetPath: "apps/web/src/generated/implementation-surfaces/landing-surface.ts",
  surface: {
    kind: "landing",
    eyebrow: "Landing preview",
    headline: "Landing surface waiting",
    subheadline: "A landing mission can replace this allowlisted module through the implementation patch policy.",
    primaryAction: "Start mission",
    secondaryAction: "Review policy",
    panels: [
      { label: "Plan", detail: "Waiting for mission planning.", tone: "primary" },
      { label: "Patch", detail: "Waiting for a bounded landing patch.", tone: "neutral" }
    ]
  }
};
