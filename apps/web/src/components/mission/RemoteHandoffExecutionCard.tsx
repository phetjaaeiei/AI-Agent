import {
  AlertTriangle,
  CheckCircle2,
  GitPullRequest,
  PauseCircle,
  Radio,
  Upload
} from "lucide-react";
import type { GitOperationRecord } from "../../../../../packages/shared/src/index.js";
import type { RuntimeAuditEvent } from "../../../../../packages/workflow/src/index.js";
import {
  getRemoteHandoffExecutionEvidence,
  getRemoteHandoffOperationStatus,
  getRemoteHandoffOperationSummary
} from "../../utils/remote-handoff.js";
import type { RemoteHandoffExecutionStatus } from "../../utils/remote-handoff.js";

type HandoffExecutionRow = {
  id: string;
  label: string;
  status: RemoteHandoffExecutionStatus;
  summary: string;
};

export function RemoteHandoffExecutionCard({
  auditEvents,
  gitOperations,
  title = "Remote Handoff Execution"
}: {
  auditEvents: readonly RuntimeAuditEvent[];
  gitOperations: readonly GitOperationRecord[];
  title?: string;
}) {
  const { branchPush, draftPr, latestAudit, status } = getRemoteHandoffExecutionEvidence({ auditEvents, gitOperations });
  const rows: HandoffExecutionRow[] = [
    {
      id: "gate",
      label: "Execution gate",
      status,
      summary: latestAudit?.summary ?? "Waiting for a completed controller handoff policy run."
    },
    operationRow("branch-push", "Branch push", branchPush, latestAudit),
    operationRow("draft-pr", "Draft PR", draftPr, latestAudit)
  ];

  return (
    <section className={`remote-handoff-card status-${status}`} aria-label="Remote handoff execution">
      <div className="remote-handoff-heading">
        <div className="section-title">
          <Radio size={16} />
          <h3>{title}</h3>
        </div>
        <span>{status}</span>
      </div>
      <div className="remote-handoff-summary">
        {statusIcon(status)}
        <p>{latestAudit?.summary ?? "No remote handoff execution attempt has been recorded yet."}</p>
      </div>
      <div className="remote-handoff-list">
        {rows.map((row) => (
          <article className={`remote-handoff-row status-${row.status}`} key={row.id}>
            {row.id === "draft-pr" ? <GitPullRequest size={13} /> : row.id === "branch-push" ? <Upload size={13} /> : statusIcon(row.status)}
            <div>
              <strong>{row.label}</strong>
              <p>{row.summary}</p>
            </div>
            <span>{row.status}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function operationRow(
  id: string,
  label: string,
  operation: GitOperationRecord | undefined,
  latestAudit: RuntimeAuditEvent | undefined
): HandoffExecutionRow {
  return {
    id,
    label,
    status: getRemoteHandoffOperationStatus(operation, latestAudit),
    summary: getRemoteHandoffOperationSummary(operation, latestAudit)
  };
}

function statusIcon(status: RemoteHandoffExecutionStatus) {
  if (status === "completed") return <CheckCircle2 size={13} />;
  if (status === "blocked" || status === "failed") return <AlertTriangle size={13} />;
  if (status === "skipped") return <PauseCircle size={13} />;
  return <Radio size={13} />;
}
