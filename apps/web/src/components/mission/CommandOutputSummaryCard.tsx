import { Code2 } from "lucide-react";
import { formatHistoryTimestamp } from "../../utils/time-format.js";

export type CommandOutputSummary = {
  id: string;
  source: "tool" | "git";
  label: string;
  status: string;
  target: string;
  summary: string;
  preview: string;
  redactionCount: number;
  updatedAt: string;
};

export function CommandOutputSummaryCard({ summaries }: { summaries: readonly CommandOutputSummary[] }) {
  const redactionCount = summaries.reduce((total, summary) => total + summary.redactionCount, 0);

  return (
    <section className="command-output-card" aria-label="Safe command output summaries">
      <div className="command-output-heading">
        <div className="section-title">
          <Code2 size={16} />
          <h3>Command Output</h3>
        </div>
        <span>{redactionCount} redacted</span>
      </div>
      <p className="command-output-note">Summaries are clipped and redacted before display.</p>
      {summaries.length > 0 ? (
        <div className="command-output-list">
          {summaries.map((summary) => (
            <article className={`command-output-row status-${summary.status}`} key={`${summary.source}-${summary.id}`}>
              <div className="command-output-row-head">
                <span>{summary.source === "tool" ? "Tool" : "Git"}</span>
                <strong>{summary.label}</strong>
                <em>{summary.status}</em>
              </div>
              <small>{summary.target}</small>
              <p>{summary.summary}</p>
              <pre>{summary.preview}</pre>
              <footer>
                <time dateTime={summary.updatedAt}>{formatHistoryTimestamp(summary.updatedAt)}</time>
                <span>{summary.redactionCount > 0 ? `${summary.redactionCount} redaction${summary.redactionCount === 1 ? "" : "s"}` : "No redactions"}</span>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <p className="command-output-empty">No command output has been captured yet.</p>
      )}
    </section>
  );
}
