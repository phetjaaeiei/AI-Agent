import { Code2 } from "lucide-react";
import type { RuntimeArtifactContent } from "../../../../../packages/workflow/src/index.js";
import type { MissionImplementationPreview, MissionImplementationPreviewSurface } from "../../generated/mission-implementation-preview.js";
import { findImplementationSurfaceModule } from "../../utils/implementation-surfaces.js";
import type { ImplementationSurfaceModule } from "../../utils/implementation-surfaces.js";

export function ImplementationPreviewCard({
  patchContent,
  preview,
  surfaceModules = []
}: {
  patchContent: RuntimeArtifactContent | undefined;
  preview: MissionImplementationPreview;
  surfaceModules?: readonly ImplementationSurfaceModule[];
}) {
  const display = createDisplayPreview(preview, patchContent, surfaceModules);

  return (
    <section className="implementation-preview-card" aria-label="Implementation preview">
      <div className="implementation-preview-heading">
        <div className="section-title">
          <Code2 size={16} />
          <h3>Implementation Preview</h3>
        </div>
        <span>{display.status}</span>
      </div>
      <div className="implementation-preview-body">
        <strong>{display.title}</strong>
        <p>{display.summary}</p>
      </div>
      <div className="implementation-preview-facts">
        <span>Target <strong>{display.targetPath}</strong></span>
        <span>Generated <strong>{formatPreviewDate(display.generatedAt)}</strong></span>
      </div>
      <div className="implementation-preview-command">
        <span>{display.commandLabel}</span>
        <code>{display.command}</code>
      </div>
      <div className={`implementation-preview-surface surface-${display.surface.kind}`} aria-label="Rendered implementation preview">
        <div className="implementation-preview-surface-copy">
          <span>{display.surface.eyebrow}</span>
          <strong>{display.surface.headline}</strong>
          <p>{display.surface.subheadline}</p>
          <div className="implementation-preview-actions">
            <span>{display.surface.primaryAction}</span>
            <span>{display.surface.secondaryAction}</span>
          </div>
        </div>
        <div className="implementation-preview-surface-panels">
          {display.surface.panels.map((panel) => (
            <article className={`tone-${panel.tone}`} key={panel.label}>
              <strong>{panel.label}</strong>
              <p>{panel.detail}</p>
            </article>
          ))}
        </div>
      </div>
      <div className="implementation-preview-sections">
        {display.sections.map((section) => (
          <article key={section.label}>
            <strong>{section.label}</strong>
            <p>{section.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function createDisplayPreview(
  preview: MissionImplementationPreview,
  patchContent: RuntimeArtifactContent | undefined,
  surfaceModules: readonly ImplementationSurfaceModule[]
) {
  if (!patchContent) {
    return {
      command: preview.command,
      commandLabel: "Mission command",
      generatedAt: preview.generatedAt,
      sections: preview.sections,
      status: preview.source === "mission_controller" ? "generated" : "waiting",
      summary: preview.summary,
      surface: preview.surface,
      targetPath: preview.targetPath,
      title: preview.title
    };
  }

  const targetPath = patchContent.sections[0]?.evidence.find((item) => item.startsWith("Target: "))?.replace("Target: ", "") ?? patchContent.artifactId;
  const surfaceModule = findImplementationSurfaceModule(
    surfaceModules,
    targetPath.includes("/implementation-surfaces/") ? targetPath : preview.surfaceModulePath
  );

  return {
    command: patchContent.artifactId,
    commandLabel: "Patch artifact",
    generatedAt: patchContent.createdAt,
    sections: patchContent.sections.slice(0, 3).map((section) => ({
      label: section.heading,
      summary: section.body.split("\n")[0] ?? section.body
    })),
    status: "generated",
    summary: patchContent.summary,
    surface: surfaceModule?.surface ?? createArtifactSurface(patchContent, targetPath),
    targetPath,
    title: patchContent.title
  };
}

function createArtifactSurface(patchContent: RuntimeArtifactContent, targetPath: string): MissionImplementationPreviewSurface {
  const patchSection = patchContent.sections.find((section) => section.heading === "Patch");
  const lineCount = patchSection?.body.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length ?? 0;
  const firstEvidence = patchContent.sections[0]?.evidence[0]?.replace("Target: ", "") ?? targetPath;

  return {
    kind: "workflow",
    eyebrow: "Rendered from patch artifact",
    headline: "Local patch preview is ready",
    subheadline: patchContent.summary,
    primaryAction: "Inspect patch",
    secondaryAction: "Run QA",
    panels: [
      {
        label: "Target",
        detail: firstEvidence,
        tone: "primary"
      },
      {
        label: "Patch",
        detail: `${lineCount || 1} changed preview lines recorded.`,
        tone: "success"
      },
      {
        label: "Recovery",
        detail: "This surface is rebuilt from archived artifact evidence.",
        tone: "neutral"
      }
    ]
  };
}

function formatPreviewDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
