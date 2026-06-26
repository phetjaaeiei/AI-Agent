import { Code2 } from "lucide-react";
import type { RuntimeArtifactContent } from "../../../../../packages/workflow/src/index.js";
import type { MissionImplementationPreview } from "../../generated/mission-implementation-preview.js";

export function ImplementationPreviewCard({
  patchContent,
  preview
}: {
  patchContent: RuntimeArtifactContent | undefined;
  preview: MissionImplementationPreview;
}) {
  const display = createDisplayPreview(preview, patchContent);

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

function createDisplayPreview(preview: MissionImplementationPreview, patchContent: RuntimeArtifactContent | undefined) {
  if (!patchContent) {
    return {
      command: preview.command,
      commandLabel: "Mission command",
      generatedAt: preview.generatedAt,
      sections: preview.sections,
      status: preview.source === "mission_controller" ? "generated" : "waiting",
      summary: preview.summary,
      targetPath: preview.targetPath,
      title: preview.title
    };
  }

  const targetPath = patchContent.sections[0]?.evidence.find((item) => item.startsWith("Target: "))?.replace("Target: ", "") ?? patchContent.artifactId;

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
    targetPath,
    title: patchContent.title
  };
}

function formatPreviewDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
