import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUTOMATION_ACTION_KINDS,
  AUTOMATION_EVIDENCE_REQUIREMENTS,
  createDefaultAutomationPolicySnapshot,
  evaluateAutomationAction
} from "../../dist/packages/shared/src/index.js";
import {
  createOrchestratorServer
} from "../../dist/apps/orchestrator/src/server.js";
import { FileArtifactContentStore } from "../../dist/apps/orchestrator/src/artifact-content-store.js";
import { FileMissionStore } from "../../dist/apps/orchestrator/src/mission-store.js";
import {
  createDefaultOrchestratorArtifactContents,
  createDefaultOrchestratorSession
} from "../../dist/apps/orchestrator/src/fixtures.js";

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const allEvidence = Object.fromEntries(AUTOMATION_EVIDENCE_REQUIREMENTS.map((item) => [item, true]));
const snapshot = createDefaultAutomationPolicySnapshot("2026-06-26T12:00:00.000Z");
const actions = snapshot.actions.map((action) => action.kind);
const uniqueActions = [...new Set(actions)];

assert(snapshot.schemaVersion === 1, "Automation policy schema version should be 1.");
assert(snapshot.policyVersion === "phase9-guarded-automation-v1", "Automation policy version should identify Phase 9 v1.");
assert(actions.length === AUTOMATION_ACTION_KINDS.length, "Every automation action kind should have a policy row.");
assert(uniqueActions.length === actions.length, "Automation policy should not contain duplicate action rows.");

for (const kind of AUTOMATION_ACTION_KINDS) {
  assert(actions.includes(kind), `Automation policy is missing ${kind}.`);
}

const hardDisabled = [
  "force_push",
  "branch_delete",
  "destructive_git_reset",
  "destructive_git_checkout",
  "secret_serialization",
  "silent_fine_tuning",
  "unbounded_autonomous_loop"
];

for (const kind of hardDisabled) {
  const decision = evaluateAutomationAction(snapshot, { kind, requestedMode: "auto", evidence: allEvidence }, "2026-06-26T12:00:01.000Z");
  assert(decision.disabled === true, `${kind} should be disabled.`);
  assert(decision.canRunAutomatically === false, `${kind} should never run automatically.`);
  assert(decision.maxAutomaticAttempts === 0, `${kind} should not receive automatic attempts.`);
  assert(decision.blockers.length > 0, `${kind} should report a blocker.`);
}

const branchPushWithoutEvidence = evaluateAutomationAction(snapshot, { kind: "git_branch_push" });
assert(branchPushWithoutEvidence.effectiveMode === "review_required", "Branch push should default to review required.");
assert(branchPushWithoutEvidence.canRunAutomatically === false, "Branch push should not auto-run without evidence.");
assert(branchPushWithoutEvidence.missingEvidence.includes("reviewed_delivery"), "Branch push should require reviewed delivery.");
assert(branchPushWithoutEvidence.missingEvidence.includes("connector_policy_present"), "Branch push should require connector policy.");

const branchPushWithEvidence = evaluateAutomationAction(snapshot, {
  kind: "git_branch_push",
  requestedMode: "auto",
  evidence: allEvidence
});
assert(branchPushWithEvidence.allowed === true, "Branch push should become allowed when all automation evidence is present.");
assert(branchPushWithEvidence.canRunAutomatically === true, "Branch push should be eligible for bounded auto after explicit evidence.");
assert(branchPushWithEvidence.maxAutomaticAttempts === 1, "Branch push should have one automatic attempt at most.");

const draftPrWithEvidence = evaluateAutomationAction(snapshot, {
  kind: "git_draft_pr_create",
  requestedMode: "auto",
  evidence: allEvidence
});
assert(draftPrWithEvidence.canRunAutomatically === true, "Draft PR creation should be eligible for bounded auto after explicit evidence.");

const localCommitAuto = evaluateAutomationAction(snapshot, {
  kind: "git_local_commit",
  requestedMode: "auto",
  evidence: allEvidence
});
assert(localCommitAuto.canRunAutomatically === false, "Local commit should not be controller-auto.");
assert(localCommitAuto.blockers.some((item) => item.includes("Requested mode auto")), "Local commit should reject requested auto mode.");

const mergeAuto = evaluateAutomationAction(snapshot, {
  kind: "pull_request_merge",
  requestedMode: "auto",
  evidence: allEvidence
});
assert(mergeAuto.canRunAutomatically === false, "Pull request merge should not become automatic in Phase 9 v1.");
assert(mergeAuto.requiresManualAction === true, "Pull request merge should remain manual-only.");

const stagingAuto = evaluateAutomationAction(snapshot, {
  kind: "deploy_staging",
  requestedMode: "auto",
  evidence: allEvidence
});
assert(stagingAuto.canRunAutomatically === true, "Staging deploy may become bounded-auto with all required deployment evidence.");

const productionAuto = evaluateAutomationAction(snapshot, {
  kind: "deploy_production",
  requestedMode: "auto",
  evidence: allEvidence
});
assert(productionAuto.canRunAutomatically === false, "Production deploy should not become automatic in Phase 9 v1.");
assert(productionAuto.requiresManualAction === true, "Production deploy should remain manual-only.");

const retryWithoutBudget = evaluateAutomationAction(snapshot, { kind: "controller_retry" });
assert(retryWithoutBudget.canRunAutomatically === false, "Controller retry should not auto-run without retry budget evidence.");
assert(retryWithoutBudget.missingEvidence.includes("bounded_retry_budget"), "Controller retry should require bounded retry budget.");

const retryWithBudget = evaluateAutomationAction(snapshot, {
  kind: "controller_retry",
  evidence: { bounded_retry_budget: true }
});
assert(retryWithBudget.canRunAutomatically === true, "Controller retry should auto-run with bounded retry budget evidence.");
assert(retryWithBudget.maxAutomaticAttempts === 1, "Controller retry should have one automatic attempt at most.");

const tempDir = await mkdtemp(join(tmpdir(), "team-ai-agent-automation-policy-"));
const server = createOrchestratorServer({
  store: new FileMissionStore(join(tempDir, "mission-session.json"), () => createDefaultOrchestratorSession("2026-06-26T12:00:00.000Z")),
  artifactStore: new FileArtifactContentStore(join(tempDir, "mission-artifacts.json"), () =>
    createDefaultOrchestratorArtifactContents("2026-06-26T12:00:00.000Z")
  ),
  now: () => "2026-06-26T12:00:00.000Z"
});

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : undefined;
  assert(typeof port === "number", "Automation policy verification server should bind to a port.");

  if (typeof port === "number") {
    const response = await fetch(`http://127.0.0.1:${port}/api/mission/automation-policy`);
    assert(response.status === 200, "Automation policy endpoint should return HTTP 200.");
    const payload = await response.json();
    assert(payload.policyVersion === snapshot.policyVersion, "Automation policy endpoint should return Phase 9 policy version.");
    assert(payload.actions?.length === snapshot.actions.length, "Automation policy endpoint should return every action row.");
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Automation policy verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Automation policy verification passed.");
console.log(`Policy rows verified: ${snapshot.actions.length}`);
console.log(`Hard-disabled actions verified: ${hardDisabled.length}`);
