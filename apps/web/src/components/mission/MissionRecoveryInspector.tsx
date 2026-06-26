import {
  Activity,
  AlertTriangle,
  Archive,
  Bot,
  ClipboardCheck,
  Code2,
  FileText,
  GitBranch,
  Play,
  ShieldCheck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MissionControllerStage } from "../../../../../packages/shared/src/index.js";
import type { MissionHistoryRecord } from "../../../../../packages/workflow/src/index.js";
import { gitOperationKindLabel, gitOperationSummary, toolCallKindLabel } from "../../utils/operation-labels.js";
import { getShortRoleName } from "../../utils/role-labels.js";
import { formatHistoryTimestamp } from "../../utils/time-format.js";
import { AutomationDecisionSummary } from "./AutomationDecisionSummary.js";
import { RemoteHandoffExecutionCard } from "./RemoteHandoffExecutionCard.js";

const missionControllerStages: readonly MissionControllerStage[] = [
  "planning",
  "tool_evidence",
  "git_evidence",
  "review_packet",
  "local_ci",
  "reviewers",
  "delivery",
  "handoff_policy"
];

export function MissionRecoveryInspector({ history }: { history: MissionHistoryRecord }) {
  const controller = history.controller;
  const packet = history.reviewPackets[0];
  const deliveryArtifactId = controller?.deliveryArtifactContentId ?? packet?.deliveryArtifactContentId;
  const delivery = history.artifactContents.find((artifact) => artifact.id === deliveryArtifactId);
  const stageResults = controller?.stageResults
    .filter((result) => result.attempt === controller.attempt)
    .sort((a, b) => missionControllerStages.indexOf(a.stage) - missionControllerStages.indexOf(b.stage)) ?? [];

  return (
    <aside className="inspector recovery-inspector" aria-label="Recovered mission evidence">
      <div className="inspector-header">
        <div>
          <span>Read-only archive</span>
          <h2>{history.title}</h2>
        </div>
        <Archive size={22} />
      </div>
      <div className="recovery-banner">
        <ShieldCheck size={15} />
        <span>Snapshot {formatHistoryTimestamp(history.archivedAt ?? history.updatedAt)}</span>
        <strong className={`status-${history.status}`}>{history.status}</strong>
      </div>

      <section className="recovery-section" aria-label="Recovered controller run">
        <div className="section-title">
          <Play size={15} />
          <h3>Controller run</h3>
        </div>
        {controller ? (
          <>
            <div className="recovery-facts">
              <span>Attempt <strong>{controller.attempt}/{controller.maxAttempts}</strong></span>
              <span>Stage <strong>{controller.currentStage.replaceAll("_", " ")}</strong></span>
              <span>Provider <strong>{controller.providerPreference}</strong></span>
            </div>
            <ol className="recovery-stage-list">
              {stageResults.map((result) => (
                <li className={`status-${result.status}`} key={`${result.attempt}-${result.stage}`}>
                  <strong>{result.stage.replaceAll("_", " ")}</strong>
                  <span>{result.summary}</span>
                </li>
              ))}
            </ol>
            {controller.stopReason ? <p className="controller-stop-reason"><AlertTriangle size={13} /> {controller.stopReason.message}</p> : null}
            {controller.automationDecisions?.length ? (
              <AutomationDecisionSummary decisions={controller.automationDecisions} title="Recovered handoff decisions" />
            ) : null}
            <RemoteHandoffExecutionCard
              auditEvents={history.session.auditEvents}
              gitOperations={history.gitOperations}
              title="Recovered remote handoff execution"
            />
          </>
        ) : <p className="recovery-empty">No controller run was attached to this intake.</p>}
      </section>

      <section className="recovery-section" aria-label="Recovered evidence totals">
        <div className="section-title">
          <Activity size={15} />
          <h3>Evidence ledger</h3>
        </div>
        <div className="recovery-count-grid">
          <span><strong>{history.agentRuns.length}</strong> Agent</span>
          <span><strong>{history.toolCalls.length}</strong> Tool</span>
          <span><strong>{history.gitOperations.length}</strong> Git</span>
          <span><strong>{history.reviewPackets.length}</strong> Review</span>
          <span><strong>{history.artifactContents.length}</strong> Artifacts</span>
        </div>
      </section>

      <RecoveryEvidenceList
        emptyLabel="No agent run evidence"
        icon={Bot}
        items={history.agentRuns.map((run) => ({
          id: run.id,
          label: `${getShortRoleName(run.roleId)} · ${run.provider}`,
          status: run.status,
          summary: run.errorSummary ?? run.verification?.decision ?? `${run.usage.outputTokens} output tokens`
        }))}
        title="Agent runs"
      />
      <RecoveryEvidenceList
        emptyLabel="No tool evidence"
        icon={Code2}
        items={history.toolCalls.map((call) => ({
          id: call.id,
          label: toolCallKindLabel[call.kind],
          status: call.status,
          summary: call.errorSummary ?? call.result?.summary ?? call.policy.reason
        }))}
        title="Tool evidence"
      />
      <RecoveryEvidenceList
        emptyLabel="No Git evidence"
        icon={GitBranch}
        items={history.gitOperations.map((operation) => ({
          id: operation.id,
          label: gitOperationKindLabel[operation.kind],
          status: operation.status,
          summary: gitOperationSummary(operation)
        }))}
        title="Git operations"
      />

      <section className="recovery-section" aria-label="Recovered review packet">
        <div className="section-title">
          <ClipboardCheck size={15} />
          <h3>Review and CI</h3>
        </div>
        {packet ? (
          <>
            <div className="recovery-facts">
              <span>Status <strong>{packet.status.replaceAll("_", " ")}</strong></span>
              <span>CI <strong>{packet.ciRun?.status ?? "not run"}</strong></span>
              <span>Reviews <strong>{packet.reviews.length}/{packet.requiredReviewerRoleIds.length}</strong></span>
            </div>
            <p>{packet.summary}</p>
          </>
        ) : <p className="recovery-empty">No review packet was attached.</p>}
      </section>

      <section className="recovery-section recovery-delivery" aria-label="Recovered delivery packet">
        <div className="section-title">
          <FileText size={15} />
          <h3>Delivery packet</h3>
        </div>
        {delivery ? (
          <>
            <strong>{delivery.title}</strong>
            <p>{delivery.summary}</p>
            {delivery.sections.slice(0, 3).map((section) => (
              <div className="recovery-delivery-section" key={section.heading}>
                <span>{section.heading}</span>
                <p>{section.body}</p>
              </div>
            ))}
          </>
        ) : <p className="recovery-empty">No delivery packet was generated for this run.</p>}
      </section>
    </aside>
  );
}

function RecoveryEvidenceList({
  emptyLabel,
  icon: Icon,
  items,
  title
}: {
  emptyLabel: string;
  icon: LucideIcon;
  items: readonly { id: string; label: string; status: string; summary: string }[];
  title: string;
}) {
  return (
    <section className="recovery-section" aria-label={title}>
      <div className="section-title">
        <Icon size={15} />
        <h3>{title}</h3>
      </div>
      {items.length > 0 ? (
        <div className="recovery-evidence-list">
          {items.slice(0, 8).map((item) => (
            <div className="recovery-evidence-row" key={item.id}>
              <span className={`status-${item.status}`}>{item.status}</span>
              <strong>{item.label}</strong>
              <p>{item.summary}</p>
            </div>
          ))}
        </div>
      ) : <p className="recovery-empty">{emptyLabel}</p>}
    </section>
  );
}
