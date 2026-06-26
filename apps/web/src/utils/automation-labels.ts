import type {
  AutomationActionKind,
  AutomationDecision,
  AutomationEvidenceRequirement,
  AutomationMode
} from "../../../../packages/shared/src/index.js";

export const automationModeLabel: Record<AutomationMode, string> = {
  auto: "Auto",
  review_required: "Review",
  manual_only: "Manual",
  disabled: "Disabled"
};

export function automationActionLabel(kind: AutomationActionKind): string {
  if (kind === "controller_retry") return "Controller retry";
  if (kind === "git_branch_push") return "Branch push";
  if (kind === "git_draft_pr_create") return "Draft PR";
  if (kind === "pull_request_merge") return "Merge";
  if (kind === "deploy_staging") return "Staging deploy";
  if (kind === "deploy_production") return "Production deploy";
  if (kind === "force_push") return "Force push";
  if (kind === "branch_delete") return "Branch deletion";
  if (kind === "destructive_git_reset") return "Git reset";
  if (kind === "destructive_git_checkout") return "Git checkout";
  if (kind === "secret_serialization") return "Secret serialization";
  if (kind === "silent_fine_tuning") return "Fine-tuning";
  if (kind === "unbounded_autonomous_loop") return "Unbounded loop";
  return kind.replaceAll("_", " ");
}

export function automationDecisionDetail(decision: AutomationDecision): string {
  if (decision.canRunAutomatically) {
    return `Max ${decision.maxAutomaticAttempts} bounded attempt${decision.maxAutomaticAttempts === 1 ? "" : "s"}`;
  }
  if (decision.missingEvidence[0]) return `Missing ${formatAutomationEvidence(decision.missingEvidence[0])}`;
  return decision.blockers[0] ?? decision.reason;
}

function formatAutomationEvidence(requirement: AutomationEvidenceRequirement): string {
  return requirement.replaceAll("_", " ");
}
