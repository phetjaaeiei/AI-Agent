export const AUTOMATION_POLICY_SCHEMA_VERSION = 1;

export const AUTOMATION_ACTION_KINDS = [
  "mission_plan",
  "controller_retry",
  "tool_read",
  "tool_write_local",
  "test_command",
  "git_status",
  "git_diff",
  "git_commit_plan",
  "git_local_commit",
  "git_branch_push",
  "git_draft_pr_create",
  "pull_request_merge",
  "deploy_staging",
  "deploy_production",
  "force_push",
  "branch_delete",
  "destructive_git_reset",
  "destructive_git_checkout",
  "secret_serialization",
  "silent_fine_tuning",
  "unbounded_autonomous_loop"
] as const;

export type AutomationActionKind = (typeof AUTOMATION_ACTION_KINDS)[number];

export type AutomationMode = "auto" | "review_required" | "manual_only" | "disabled";

export type AutomationRiskClass =
  | "local_read"
  | "local_write"
  | "local_test"
  | "remote_write"
  | "release"
  | "production"
  | "destructive"
  | "secret"
  | "model_mutation"
  | "loop_control";

export const AUTOMATION_EVIDENCE_REQUIREMENTS = [
  "policy_switch_enabled",
  "connector_policy_present",
  "reviewed_delivery",
  "passing_local_ci",
  "reviewer_approval",
  "remote_branch_current",
  "draft_pr_open",
  "rollback_plan",
  "staging_smoke_passed",
  "production_approval",
  "bounded_retry_budget",
  "no_secret_material"
] as const;

export type AutomationEvidenceRequirement = (typeof AUTOMATION_EVIDENCE_REQUIREMENTS)[number];

export type AutomationEvidenceContext = Partial<Record<AutomationEvidenceRequirement, boolean>>;

export type AutomationActionPolicy = {
  kind: AutomationActionKind;
  label: string;
  riskClass: AutomationRiskClass;
  defaultMode: AutomationMode;
  allowedModes: readonly AutomationMode[];
  requiredEvidence: readonly AutomationEvidenceRequirement[];
  automaticEvidence: readonly AutomationEvidenceRequirement[];
  hardDisabled: boolean;
  maxAutomaticAttempts: number;
  summary: string;
};

export type AutomationPolicySnapshot = {
  schemaVersion: 1;
  policyVersion: string;
  generatedAt: string;
  boundedLoopMaxAttempts: number;
  actions: readonly AutomationActionPolicy[];
};

export type AutomationDecisionRequest = {
  kind: AutomationActionKind;
  requestedMode?: AutomationMode;
  evidence?: AutomationEvidenceContext;
};

export type AutomationDecision = {
  kind: AutomationActionKind;
  requestedMode: AutomationMode;
  effectiveMode: AutomationMode;
  allowed: boolean;
  canRunAutomatically: boolean;
  requiresReview: boolean;
  requiresManualAction: boolean;
  disabled: boolean;
  blockers: readonly string[];
  satisfiedEvidence: readonly AutomationEvidenceRequirement[];
  missingEvidence: readonly AutomationEvidenceRequirement[];
  reason: string;
  maxAutomaticAttempts: number;
  checkedAt: string;
};

const DEFAULT_GENERATED_AT = "2026-06-26T00:00:00.000Z";

const DEFAULT_ACTION_POLICIES: readonly AutomationActionPolicy[] = [
  {
    kind: "mission_plan",
    label: "Mission planning",
    riskClass: "local_read",
    defaultMode: "auto",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: [],
    automaticEvidence: [],
    hardDisabled: false,
    maxAutomaticAttempts: 2,
    summary: "Local planning may run automatically with bounded attempts and visible output."
  },
  {
    kind: "controller_retry",
    label: "Controller retry",
    riskClass: "loop_control",
    defaultMode: "auto",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: ["bounded_retry_budget"],
    automaticEvidence: ["bounded_retry_budget"],
    hardDisabled: false,
    maxAutomaticAttempts: 1,
    summary: "A retry may run automatically only while a bounded retry budget remains."
  },
  {
    kind: "tool_read",
    label: "Tool read",
    riskClass: "local_read",
    defaultMode: "auto",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: ["no_secret_material"],
    automaticEvidence: ["no_secret_material"],
    hardDisabled: false,
    maxAutomaticAttempts: 2,
    summary: "Workspace-confined reads may run automatically when secret material is excluded."
  },
  {
    kind: "tool_write_local",
    label: "Local file write",
    riskClass: "local_write",
    defaultMode: "review_required",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: ["no_secret_material"],
    automaticEvidence: ["reviewed_delivery", "no_secret_material"],
    hardDisabled: false,
    maxAutomaticAttempts: 1,
    summary: "Local writes need visible evidence and stay inside the tool-runner policy."
  },
  {
    kind: "test_command",
    label: "Test command",
    riskClass: "local_test",
    defaultMode: "auto",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: [],
    automaticEvidence: [],
    hardDisabled: false,
    maxAutomaticAttempts: 2,
    summary: "Allowlisted local test commands may run automatically with bounded output."
  },
  {
    kind: "git_status",
    label: "Git status",
    riskClass: "local_read",
    defaultMode: "auto",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: ["no_secret_material"],
    automaticEvidence: ["no_secret_material"],
    hardDisabled: false,
    maxAutomaticAttempts: 2,
    summary: "Git status is read-only and may run automatically inside the workspace."
  },
  {
    kind: "git_diff",
    label: "Git diff",
    riskClass: "local_read",
    defaultMode: "auto",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: ["no_secret_material"],
    automaticEvidence: ["no_secret_material"],
    hardDisabled: false,
    maxAutomaticAttempts: 2,
    summary: "Git diff may run automatically only with denied-path and secret redaction."
  },
  {
    kind: "git_commit_plan",
    label: "Git commit plan",
    riskClass: "local_read",
    defaultMode: "auto",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: ["no_secret_material"],
    automaticEvidence: ["no_secret_material"],
    hardDisabled: false,
    maxAutomaticAttempts: 2,
    summary: "Offline commit planning may run automatically because it does not mutate Git state."
  },
  {
    kind: "git_local_commit",
    label: "Local Git commit",
    riskClass: "local_write",
    defaultMode: "review_required",
    allowedModes: ["review_required", "manual_only"],
    requiredEvidence: ["policy_switch_enabled", "reviewed_delivery", "passing_local_ci", "no_secret_material"],
    automaticEvidence: [],
    hardDisabled: false,
    maxAutomaticAttempts: 0,
    summary: "Local commits remain explicit review-gated actions and are not controller-auto."
  },
  {
    kind: "git_branch_push",
    label: "Remote branch push",
    riskClass: "remote_write",
    defaultMode: "review_required",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: ["policy_switch_enabled", "connector_policy_present", "reviewed_delivery", "passing_local_ci", "remote_branch_current", "no_secret_material"],
    automaticEvidence: ["policy_switch_enabled", "connector_policy_present", "reviewed_delivery", "passing_local_ci", "remote_branch_current", "no_secret_material"],
    hardDisabled: false,
    maxAutomaticAttempts: 1,
    summary: "Remote branch push can only become automatic after explicit connector policy and reviewed delivery evidence."
  },
  {
    kind: "git_draft_pr_create",
    label: "Draft PR creation",
    riskClass: "remote_write",
    defaultMode: "review_required",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: ["policy_switch_enabled", "connector_policy_present", "reviewed_delivery", "passing_local_ci", "remote_branch_current", "no_secret_material"],
    automaticEvidence: ["policy_switch_enabled", "connector_policy_present", "reviewed_delivery", "passing_local_ci", "remote_branch_current", "no_secret_material"],
    hardDisabled: false,
    maxAutomaticAttempts: 1,
    summary: "Draft PR creation can only become automatic after branch publication and reviewed delivery evidence."
  },
  {
    kind: "pull_request_merge",
    label: "Pull request merge",
    riskClass: "release",
    defaultMode: "manual_only",
    allowedModes: ["manual_only"],
    requiredEvidence: ["connector_policy_present", "reviewed_delivery", "passing_local_ci", "reviewer_approval", "draft_pr_open", "remote_branch_current"],
    automaticEvidence: [],
    hardDisabled: false,
    maxAutomaticAttempts: 0,
    summary: "Merge remains a manual release decision until a dedicated merge connector policy exists."
  },
  {
    kind: "deploy_staging",
    label: "Staging deployment",
    riskClass: "release",
    defaultMode: "review_required",
    allowedModes: ["auto", "review_required", "manual_only"],
    requiredEvidence: ["policy_switch_enabled", "connector_policy_present", "reviewed_delivery", "passing_local_ci", "rollback_plan", "no_secret_material"],
    automaticEvidence: ["policy_switch_enabled", "connector_policy_present", "reviewed_delivery", "passing_local_ci", "rollback_plan", "no_secret_material"],
    hardDisabled: false,
    maxAutomaticAttempts: 1,
    summary: "Staging deploy may become automatic only behind explicit deployment policy, CI, review, rollback, and secret checks."
  },
  {
    kind: "deploy_production",
    label: "Production deployment",
    riskClass: "production",
    defaultMode: "manual_only",
    allowedModes: ["manual_only"],
    requiredEvidence: ["connector_policy_present", "reviewed_delivery", "passing_local_ci", "reviewer_approval", "staging_smoke_passed", "rollback_plan", "production_approval", "no_secret_material"],
    automaticEvidence: [],
    hardDisabled: false,
    maxAutomaticAttempts: 0,
    summary: "Production deployment is manual-only until canary, rollback, approval, and production policy are implemented."
  },
  {
    kind: "force_push",
    label: "Force push",
    riskClass: "destructive",
    defaultMode: "disabled",
    allowedModes: ["disabled"],
    requiredEvidence: [],
    automaticEvidence: [],
    hardDisabled: true,
    maxAutomaticAttempts: 0,
    summary: "Force push is hard-disabled."
  },
  {
    kind: "branch_delete",
    label: "Branch deletion",
    riskClass: "destructive",
    defaultMode: "disabled",
    allowedModes: ["disabled"],
    requiredEvidence: [],
    automaticEvidence: [],
    hardDisabled: true,
    maxAutomaticAttempts: 0,
    summary: "Branch deletion is hard-disabled until an audited retention policy exists."
  },
  {
    kind: "destructive_git_reset",
    label: "Destructive Git reset",
    riskClass: "destructive",
    defaultMode: "disabled",
    allowedModes: ["disabled"],
    requiredEvidence: [],
    automaticEvidence: [],
    hardDisabled: true,
    maxAutomaticAttempts: 0,
    summary: "Destructive Git reset is hard-disabled."
  },
  {
    kind: "destructive_git_checkout",
    label: "Destructive Git checkout",
    riskClass: "destructive",
    defaultMode: "disabled",
    allowedModes: ["disabled"],
    requiredEvidence: [],
    automaticEvidence: [],
    hardDisabled: true,
    maxAutomaticAttempts: 0,
    summary: "Destructive Git checkout is hard-disabled."
  },
  {
    kind: "secret_serialization",
    label: "Secret serialization",
    riskClass: "secret",
    defaultMode: "disabled",
    allowedModes: ["disabled"],
    requiredEvidence: [],
    automaticEvidence: [],
    hardDisabled: true,
    maxAutomaticAttempts: 0,
    summary: "Raw secret serialization is hard-disabled."
  },
  {
    kind: "silent_fine_tuning",
    label: "Silent fine-tuning",
    riskClass: "model_mutation",
    defaultMode: "disabled",
    allowedModes: ["disabled"],
    requiredEvidence: [],
    automaticEvidence: [],
    hardDisabled: true,
    maxAutomaticAttempts: 0,
    summary: "Silent model mutation or fine-tuning is hard-disabled."
  },
  {
    kind: "unbounded_autonomous_loop",
    label: "Unbounded autonomous loop",
    riskClass: "loop_control",
    defaultMode: "disabled",
    allowedModes: ["disabled"],
    requiredEvidence: [],
    automaticEvidence: [],
    hardDisabled: true,
    maxAutomaticAttempts: 0,
    summary: "Unbounded autonomous loops are hard-disabled."
  }
] as const;

export function createDefaultAutomationPolicySnapshot(generatedAt = DEFAULT_GENERATED_AT): AutomationPolicySnapshot {
  return {
    schemaVersion: AUTOMATION_POLICY_SCHEMA_VERSION,
    policyVersion: "phase9-guarded-automation-v1",
    generatedAt,
    boundedLoopMaxAttempts: 2,
    actions: DEFAULT_ACTION_POLICIES
  };
}

export function isAutomationActionKind(value: unknown): value is AutomationActionKind {
  return typeof value === "string" && (AUTOMATION_ACTION_KINDS as readonly string[]).includes(value);
}

export function isAutomationMode(value: unknown): value is AutomationMode {
  return typeof value === "string" && ["auto", "review_required", "manual_only", "disabled"].includes(value);
}

export function getAutomationActionPolicy(
  snapshot: AutomationPolicySnapshot,
  kind: AutomationActionKind
): AutomationActionPolicy | undefined {
  return snapshot.actions.find((action) => action.kind === kind);
}

export function evaluateAutomationAction(
  snapshot: AutomationPolicySnapshot,
  request: AutomationDecisionRequest,
  checkedAt = snapshot.generatedAt
): AutomationDecision {
  const action = getAutomationActionPolicy(snapshot, request.kind);
  if (!action) {
    return {
      kind: request.kind,
      requestedMode: request.requestedMode ?? "disabled",
      effectiveMode: "disabled",
      allowed: false,
      canRunAutomatically: false,
      requiresReview: false,
      requiresManualAction: false,
      disabled: true,
      blockers: ["Automation action is not present in the active policy snapshot."],
      satisfiedEvidence: [],
      missingEvidence: [],
      reason: "Automation action is disabled because it is unknown to the active policy.",
      maxAutomaticAttempts: 0,
      checkedAt
    };
  }

  const requestedMode = request.requestedMode ?? action.defaultMode;
  const requestedModeAllowed = action.allowedModes.includes(requestedMode);
  const effectiveMode = requestedModeAllowed ? requestedMode : action.defaultMode;
  const requiredEvidence = uniqueEvidence([...action.requiredEvidence, ...(effectiveMode === "auto" ? action.automaticEvidence : [])]);
  const evidence = request.evidence ?? {};
  const satisfiedEvidence = requiredEvidence.filter((item) => evidence[item] === true);
  const missingEvidence = requiredEvidence.filter((item) => evidence[item] !== true);
  const blockers = [
    ...(action.hardDisabled ? [action.summary] : []),
    ...(requestedModeAllowed ? [] : [`Requested mode ${requestedMode} is not allowed for ${action.label}.`]),
    ...missingEvidence.map((item) => `Missing evidence: ${item}.`)
  ];
  const disabled = action.hardDisabled || effectiveMode === "disabled";
  const canRunAutomatically = !disabled && effectiveMode === "auto" && blockers.length === 0 && action.maxAutomaticAttempts > 0;
  const allowed = !disabled && blockers.length === 0;
  const requiresReview = !disabled && effectiveMode === "review_required";
  const requiresManualAction = !disabled && effectiveMode === "manual_only";

  return {
    kind: action.kind,
    requestedMode,
    effectiveMode,
    allowed,
    canRunAutomatically,
    requiresReview,
    requiresManualAction,
    disabled,
    blockers,
    satisfiedEvidence,
    missingEvidence,
    reason: reasonForDecision(action, effectiveMode, allowed, canRunAutomatically, blockers),
    maxAutomaticAttempts: canRunAutomatically ? action.maxAutomaticAttempts : 0,
    checkedAt
  };
}

function uniqueEvidence(values: readonly AutomationEvidenceRequirement[]): AutomationEvidenceRequirement[] {
  return [...new Set(values)];
}

function reasonForDecision(
  action: AutomationActionPolicy,
  mode: AutomationMode,
  allowed: boolean,
  canRunAutomatically: boolean,
  blockers: readonly string[]
): string {
  if (canRunAutomatically) return `${action.label} is cleared for bounded automatic execution.`;
  if (allowed && mode === "review_required") return `${action.label} is review-gated and ready for explicit approval.`;
  if (allowed && mode === "manual_only") return `${action.label} is manual-only and ready for a human decision.`;
  if (action.hardDisabled) return action.summary;
  return blockers.length > 0 ? `${action.label} is blocked: ${blockers.join(" ")}` : `${action.label} is disabled by automation mode.`;
}
