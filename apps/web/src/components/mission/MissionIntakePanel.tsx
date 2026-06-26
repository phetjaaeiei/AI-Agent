import { ClipboardCheck, RotateCcw } from "lucide-react";
import { missionAutonomyLabel, missionStateLabel } from "../../utils/mission-labels.js";
import type { MissionAutonomyMode, MissionLifecycleStatus } from "../../utils/mission-labels.js";
import { formatSavedAt } from "../../utils/time-format.js";

type MissionIntakePlan = {
  autonomyMode: MissionAutonomyMode;
  confidence: number;
  detectedCapabilities: readonly { label: string }[];
  missingInputs: readonly string[];
  recommendedRoleIds: readonly unknown[];
  risks: readonly { label: string; level: string }[];
};

type MissionIntakeState = {
  status: MissionLifecycleStatus;
  statusReason: string;
  title: string;
};

export function MissionIntakePanel({
  assumptionCount,
  assumptionDraft,
  commandDraft,
  isAutopilotRunning,
  isSaving,
  lastSavedAt,
  lastSavedCommandDraft,
  missionPlan,
  missionState,
  onAssumptionChange,
  onCommandChange,
  onResetDraft,
  onSaveMission,
  savedAssumptionDraft
}: {
  assumptionCount: number;
  assumptionDraft: string;
  commandDraft: string;
  isAutopilotRunning: boolean;
  isSaving: boolean;
  lastSavedAt: string;
  lastSavedCommandDraft: string;
  missionPlan: MissionIntakePlan;
  missionState: MissionIntakeState;
  onAssumptionChange: (value: string) => void;
  onCommandChange: (value: string) => void;
  onResetDraft: () => void;
  onSaveMission: () => void | Promise<void>;
  savedAssumptionDraft: string;
}) {
  const hasCommand = commandDraft.trim().length > 0;
  const hasDraftChanges =
    commandDraft !== lastSavedCommandDraft ||
    assumptionDraft !== savedAssumptionDraft ||
    missionState.status === "draft";
  const capabilityLabels = missionPlan.detectedCapabilities.slice(0, 4).map((capability) => capability.label);
  const riskLabels = missionPlan.risks.length > 0
    ? missionPlan.risks.slice(0, 3).map((risk) => `${risk.label} (${risk.level})`)
    : ["No high-risk signals"];
  const missingInputLabels = missionPlan.missingInputs.length > 0
    ? missionPlan.missingInputs.slice(0, 3)
    : ["Ready to run"];

  return (
    <section className="mission-intake-panel" aria-label="Mission intake">
      <form
        className="mission-intake-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSaveMission();
        }}
      >
        <div className="mission-intake-copy">
          <div className="mission-intake-heading">
            <div>
              <span>Mission intake</span>
              <h2>{missionState.title}</h2>
            </div>
            <span className={`mission-state status-${missionState.status}`} title={missionState.statusReason}>
              {missionStateLabel[missionState.status]}
            </span>
          </div>
          <div className="mission-intake-fields">
            <label className="mission-command-field">
              <span>Command</span>
              <textarea
                aria-label="Mission intake command"
                onChange={(event) => onCommandChange(event.target.value)}
                placeholder="Describe the next mission for the AI company"
                rows={3}
                spellCheck="false"
                value={commandDraft}
              />
            </label>
            <label className="mission-command-field">
              <span>Assumptions</span>
              <textarea
                aria-label="Mission assumptions"
                onChange={(event) => onAssumptionChange(event.target.value)}
                placeholder={"Sales API exposes daily totals\nCSV fields are export-safe"}
                rows={3}
                spellCheck="false"
                value={assumptionDraft}
              />
            </label>
          </div>
          <div className="mission-intake-chips" aria-label="Parsed mission intake">
            {[...capabilityLabels, ...riskLabels, ...missingInputLabels].slice(0, 8).map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
        <div className="mission-intake-controls">
          <div className="mission-intake-stats" aria-label="Mission intake status">
            <span>{missionAutonomyLabel(missionPlan.autonomyMode)}</span>
            <span>{missionPlan.confidence}% confidence</span>
            <span>Saved {formatSavedAt(lastSavedAt)}</span>
            <span>{missionPlan.recommendedRoleIds.length} roles</span>
            <span>{assumptionCount} assumptions</span>
          </div>
          <div className="mission-intake-actions">
            <button disabled={isSaving || isAutopilotRunning || !hasDraftChanges} onClick={onResetDraft} type="button">
              <RotateCcw size={15} />
              Reset draft
            </button>
            <button className="is-primary" disabled={isSaving || isAutopilotRunning || !hasCommand || !hasDraftChanges} type="submit">
              <ClipboardCheck size={15} />
              {isSaving ? "Saving" : "Save mission"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
