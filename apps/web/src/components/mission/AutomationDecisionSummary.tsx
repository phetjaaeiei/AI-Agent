import {
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";
import type {
  AutomationActionKind,
  AutomationDecision
} from "../../../../../packages/shared/src/index.js";
import {
  automationActionLabel,
  automationDecisionDetail,
  automationModeLabel
} from "../../utils/automation-labels.js";

const handoffDecisionOrder: readonly AutomationActionKind[] = [
  "git_branch_push",
  "git_draft_pr_create",
  "deploy_staging",
  "pull_request_merge",
  "deploy_production",
  "force_push",
  "branch_delete",
  "destructive_git_reset",
  "destructive_git_checkout",
  "secret_serialization",
  "silent_fine_tuning",
  "unbounded_autonomous_loop"
];

export function AutomationDecisionSummary({
  decisions,
  title
}: {
  decisions: readonly AutomationDecision[];
  title: string;
}) {
  const orderedDecisions = [...decisions].sort(
    (a, b) => handoffDecisionOrder.indexOf(a.kind) - handoffDecisionOrder.indexOf(b.kind)
  );
  const autoReady = orderedDecisions.filter((decision) => decision.canRunAutomatically).length;
  const reviewRequired = orderedDecisions.filter((decision) => decision.requiresReview).length;
  const manualOnly = orderedDecisions.filter((decision) => decision.requiresManualAction).length;
  const disabled = orderedDecisions.filter((decision) => decision.disabled).length;

  return (
    <div className="automation-decision-summary" aria-label="Controller handoff decisions">
      <div className="automation-decision-heading">
        <div>
          <ShieldCheck size={14} />
          <strong>{title}</strong>
        </div>
        <span>{orderedDecisions.length} checked</span>
      </div>
      <div className="automation-decision-counts" aria-label="Controller handoff decision counts">
        <span><strong>{autoReady}</strong> auto</span>
        <span><strong>{reviewRequired}</strong> review</span>
        <span><strong>{manualOnly}</strong> manual</span>
        <span><strong>{disabled}</strong> disabled</span>
      </div>
      <div className="automation-decision-list">
        {orderedDecisions.map((decision) => (
          <AutomationDecisionRow decision={decision} key={decision.kind} />
        ))}
      </div>
    </div>
  );
}

function AutomationDecisionRow({ decision }: { decision: AutomationDecision }) {
  const icon = decision.disabled
    ? <LockKeyhole size={13} />
    : decision.canRunAutomatically || decision.allowed
      ? <CheckCircle2 size={13} />
      : <AlertTriangle size={13} />;

  return (
    <article className={`automation-decision-row mode-${decision.effectiveMode} ${decision.canRunAutomatically ? "is-auto-ready" : ""}`}>
      <div className="automation-decision-row-main">
        {icon}
        <div>
          <strong>{automationActionLabel(decision.kind)}</strong>
          <p>{automationDecisionDetail(decision)}</p>
        </div>
      </div>
      <span>{automationModeLabel[decision.effectiveMode]}</span>
    </article>
  );
}
