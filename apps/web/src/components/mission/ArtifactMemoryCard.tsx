import { Archive } from "lucide-react";
import type { RuntimeArtifactContent } from "../../../../../packages/workflow/src/index.js";
import { artifactSourceLabel } from "../../utils/artifact-content.js";
import { getShortRoleName } from "../../utils/role-labels.js";

export function ArtifactMemoryCard({ content }: { content: RuntimeArtifactContent | undefined }) {
  if (!content) {
    return (
      <section className="artifact-memory-card" aria-label="Generated artifact memory">
        <div className="section-title">
          <Archive size={16} />
          <h3>Artifact Memory</h3>
        </div>
        <p className="artifact-memory-empty">Run autopilot to generate the first stored artifact.</p>
      </section>
    );
  }

  const previewSections = content.sections.slice(0, 3);

  return (
    <section className="artifact-memory-card" aria-label="Generated artifact memory">
      <div className="section-title">
        <Archive size={16} />
        <h3>Artifact Memory</h3>
      </div>
      <div className="artifact-memory-header">
        <div>
          <strong>{content.title}</strong>
          <span>
            v{content.version} / {getShortRoleName(content.ownerRoleId)}
          </span>
        </div>
        <em>{artifactSourceLabel(content.source)}</em>
      </div>
      <p>{content.summary}</p>
      <div className="artifact-memory-sections">
        {previewSections.map((section) => (
          <article key={section.heading}>
            <strong>{section.heading}</strong>
            <p>{section.body}</p>
            <span>{section.evidence.slice(0, 2).join(" / ")}</span>
          </article>
        ))}
      </div>
      <details className="artifact-markdown-report">
        <summary>Markdown report</summary>
        <pre>{content.markdown}</pre>
      </details>
    </section>
  );
}
