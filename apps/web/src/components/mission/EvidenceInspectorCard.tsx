import { Search } from "lucide-react";
import type { RuntimeArtifactContent } from "../../../../../packages/workflow/src/index.js";
import { artifactSourceLabel, isSeededArtifactContent } from "../../utils/artifact-content.js";
import { formatHistoryTimestamp } from "../../utils/time-format.js";

export type EvidenceSourceFilter = "all" | "real" | RuntimeArtifactContent["source"];

export type EvidenceStatusFilter = "all" | RuntimeArtifactContent["status"];

const sourceOptions: readonly { id: EvidenceSourceFilter; label: string }[] = [
  { id: "real", label: "Real" },
  { id: "all", label: "All" },
  { id: "agent_runtime", label: "Agent" },
  { id: "tool_runner", label: "Tool" },
  { id: "git_runner", label: "Git" },
  { id: "review_service", label: "Review" },
  { id: "orchestrator", label: "Server" },
  { id: "local_runtime", label: "Local" }
];

const statusOptions: readonly { id: EvidenceStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "verified", label: "Verified" },
  { id: "reviewing", label: "Reviewing" },
  { id: "draft", label: "Draft" }
];

export function EvidenceInspectorCard({
  contents,
  onSelectArtifact,
  onSourceFilterChange,
  onStatusFilterChange,
  selectedArtifactId,
  sourceFilter,
  statusFilter,
  totalCount
}: {
  contents: readonly RuntimeArtifactContent[];
  onSelectArtifact: (artifactId: string) => void;
  onSourceFilterChange: (filter: EvidenceSourceFilter) => void;
  onStatusFilterChange: (filter: EvidenceStatusFilter) => void;
  selectedArtifactId: string;
  sourceFilter: EvidenceSourceFilter;
  statusFilter: EvidenceStatusFilter;
  totalCount: number;
}) {
  return (
    <section className="evidence-inspector-card" aria-label="Real evidence inspector">
      <div className="evidence-inspector-heading">
        <div className="section-title">
          <Search size={16} />
          <h3>Evidence Inspector</h3>
        </div>
        <span>{contents.length}/{totalCount}</span>
      </div>
      <div className="evidence-filter-group" aria-label="Evidence source filter">
        {sourceOptions.map((option) => (
          <button
            className={sourceFilter === option.id ? "is-selected" : ""}
            key={option.id}
            onClick={() => onSourceFilterChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="evidence-filter-group" aria-label="Evidence status filter">
        {statusOptions.map((option) => (
          <button
            className={statusFilter === option.id ? "is-selected" : ""}
            key={option.id}
            onClick={() => onStatusFilterChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {contents.length > 0 ? (
        <div className="evidence-inspector-list">
          {contents.slice(0, 8).map((content) => (
            <button
              aria-pressed={selectedArtifactId === content.artifactId}
              className={selectedArtifactId === content.artifactId ? "is-selected" : ""}
              key={content.id}
              onClick={() => onSelectArtifact(content.artifactId)}
              type="button"
            >
              <em>{artifactSourceLabel(content.source)}</em>
              <strong>{content.title}</strong>
              <span className={`artifact-status status-${content.status}`}>{content.status}</span>
              <p>{content.summary}</p>
              <small>{isSeededArtifactContent(content) ? "Seeded demo" : formatHistoryTimestamp(content.updatedAt)}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="evidence-inspector-empty">No evidence matches the current filters.</p>
      )}
    </section>
  );
}
