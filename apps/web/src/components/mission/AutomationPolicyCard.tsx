import {
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";
import {
  evaluateAutomationAction
} from "../../../../../packages/shared/src/index.js";
import type {
  AutomationActionKind,
  AutomationDecision,
  AutomationEvidenceContext,
  AutomationMode,
  AutomationPolicySnapshot
} from "../../../../../packages/shared/src/index.js";
import {
  automationActionLabel,
  automationDecisionDetail,
  automationModeLabel
} from "../../utils/automation-labels.js";

const visibleActionKinds: readonly AutomationActionKind[] = [
  "controller_retry",
  "git_branch_push",
  "git_draft_pr_create",
  "pull_request_merge",
  "deploy_staging",
  "deploy_production",
  "force_push",
  "branch_delete",
  "secret_serialization",
  "silent_fine_tuning",
  "unbounded_autonomous_loop"
];

export function AutomationPolicyCard({
  evidence,
  policy
}: {
  evidence: AutomationEvidenceContext;
  policy: AutomationPolicySnapshot;
}) {
  const decisions = visibleActionKinds
    .map((kind) => {
      const requestedMode = preferredModeFor(kind);
      return evaluateAutomationAction(policy, {
        kind,
        ...(requestedMode ? { requestedMode } : {}),
        evidence: evidenceForAction(kind, evidence)
      });
    })
    .filter(Boolean);
  const autoReady = decisions.filter((decision) => decision.canRunAutomatically).length;
  const reviewRequired = decisions.filter((decision) => decision.requiresReview).length;
  const manualOnly = decisions.filter((decision) => decision.requiresManualAction).length;
  const disabled = decisions.filter((decision) => decision.disabled).length;

  return (
    <section className="automation-policy-card" aria-label="Guarded automation policy">
      <div className="automation-policy-heading">
        <div className="section-title">
          <ShieldCheck size={16} />
          <h3>Automation Policy</h3>
        </div>
        <span>{policy.policyVersion.replace("phase9-", "")}</span>
      </div>
      <div className="automation-policy-summary" aria-label="Automation policy mode counts">
        <span><strong>{autoReady}</strong> auto-ready</span>
        <span><strong>{reviewRequired}</strong> review</span>
        <span><strong>{manualOnly}</strong> manual</span>
        <span><strong>{disabled}</strong> disabled</span>
      </div>
      <div className="automation-policy-list">
        {decisions.map((decision) => (
          <AutomationPolicyRow decision={decision} key={decision.kind} />
        ))}
      </div>
    </section>
  );
}

function AutomationPolicyRow({ decision }: { decision: AutomationDecision }) {
  const icon = decision.disabled
    ? <LockKeyhole size={13} />
    : decision.canRunAutomatically || decision.allowed
      ? <CheckCircle2 size={13} />
      : <AlertTriangle size={13} />;
  const detail = automationDecisionDetail(decision);

  return (
    <article className={`automation-policy-row mode-${decision.effectiveMode} ${decision.canRunAutomatically ? "is-auto-ready" : ""}`}>
      <div className="automation-policy-row-main">
        {icon}
        <div>
          <strong>{automationActionLabel(decision.kind)}</strong>
          <em>{decision.kind.replaceAll("_", " ")}</em>
        </div>
      </div>
      <span>{automationModeLabel[decision.effectiveMode]}</span>
      <p>{detail}</p>
    </article>
  );
}

function preferredModeFor(kind: AutomationActionKind): AutomationMode | undefined {
  if (kind === "git_branch_push" || kind === "git_draft_pr_create" || kind === "deploy_staging") return "auto";
  if (kind === "pull_request_merge" || kind === "deploy_production") return "auto";
  if (kind === "force_push" || kind === "branch_delete" || kind === "secret_serialization" || kind === "silent_fine_tuning" || kind === "unbounded_autonomous_loop") return "auto";
  return undefined;
}

function evidenceForAction(kind: AutomationActionKind, evidence: AutomationEvidenceContext): AutomationEvidenceContext {
  if (kind === "deploy_staging" || kind === "deploy_production" || kind === "pull_request_merge") {
    return {
      ...evidence,
      connector_policy_present: false,
      policy_switch_enabled: false,
      ...(kind === "deploy_production" ? { production_approval: false } : {}),
      ...(kind === "deploy_staging" || kind === "deploy_production" ? { staging_smoke_passed: false } : {})
    };
  }
  return evidence;
}
