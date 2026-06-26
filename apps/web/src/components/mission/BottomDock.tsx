import { Activity, AlertTriangle, Command, FileText, Play, ShieldCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AgentRuntimeInfo } from "../../../../../packages/shared/src/index.js";
import type { RuntimeMissionState } from "../../../../../packages/workflow/src/index.js";
import type { OrchestratorConnectionStatus } from "../../orchestrator-client.js";
import { missionStateLabel } from "../../utils/mission-labels.js";
import { getShortRoleName } from "../../utils/role-labels.js";
import { formatSavedAt } from "../../utils/time-format.js";

export type ActivityEvent = {
  id: string;
  roleId: Parameters<typeof getShortRoleName>[0];
  type: "artifact" | "gate" | "tool" | "risk" | "phase";
  title: string;
  summary: string;
  tone: "info" | "success" | "warning" | "danger";
  time: string;
};

export type ActivityFilter = "all" | ActivityEvent["type"];

type MissionDockPlan = {
  autonomyMode: string;
  confidence: number;
  summary: string;
  title: string;
};

const activityFilterOptions: { id: ActivityFilter; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "All", icon: Activity },
  { id: "gate", label: "Gates", icon: ShieldCheck },
  { id: "artifact", label: "Artifacts", icon: FileText },
  { id: "tool", label: "Tools", icon: Command },
  { id: "risk", label: "Risks", icon: AlertTriangle }
];

const orchestratorStatusLabel: Record<OrchestratorConnectionStatus, string> = {
  checking: "Checking server",
  connected: "Server connected",
  syncing: "Syncing server",
  local: "Local fallback"
};

export function BottomDock({
  activityFilter,
  agentRuntimeInfo,
  artifactRecordCount,
  auditEventCount,
  events,
  isAutopilotRunning,
  lastSavedAt,
  missionPlan,
  missionState,
  onFilterChange,
  onRunAutopilot,
  orchestratorMessage,
  orchestratorStatus
}: {
  activityFilter: ActivityFilter;
  agentRuntimeInfo: AgentRuntimeInfo;
  artifactRecordCount: number;
  auditEventCount: number;
  events: readonly ActivityEvent[];
  isAutopilotRunning: boolean;
  lastSavedAt: string;
  missionPlan: MissionDockPlan;
  missionState: RuntimeMissionState;
  onFilterChange: (filter: ActivityFilter) => void;
  onRunAutopilot: () => void | Promise<void>;
  orchestratorMessage: string;
  orchestratorStatus: OrchestratorConnectionStatus;
}) {
  return (
    <section className="bottom-dock" aria-label="Mission command and activity feed">
      <form
        className="command-dock"
        onSubmit={(event) => {
          event.preventDefault();
          void onRunAutopilot();
        }}
      >
        <div className="command-input execution-summary">
          <Sparkles size={18} />
          <span>Mission run</span>
          <strong>{missionPlan.title}</strong>
          <p>{missionPlan.summary}</p>
          <div className="command-meta" aria-label="Mission session memory status">
            <span className={`command-status status-${orchestratorStatus}`} title={orchestratorMessage}>
              {orchestratorStatusLabel[orchestratorStatus]}
            </span>
            <span className={`mission-state status-${missionState.status}`} title={missionState.statusReason}>
              {missionStateLabel[missionState.status]}
            </span>
            <span className={`runtime-provider status-${agentRuntimeInfo.activeProvider}`} title={agentRuntimeInfo.message}>
              {agentRuntimeInfo.activeProvider === "ollama" ? `Ollama ${agentRuntimeInfo.model}` : "Deterministic mode"}
            </span>
            <span>{missionPlan.autonomyMode.replaceAll("_", " ")}</span>
            <span>{missionPlan.confidence}% confidence</span>
            <span>Saved {formatSavedAt(lastSavedAt)}</span>
            <span>{artifactRecordCount} artifacts</span>
            <span>{auditEventCount} audit events</span>
          </div>
        </div>
        <button disabled={isAutopilotRunning} type="submit">
          <Play size={16} />
          {isAutopilotRunning ? "Mission running" : "Run local agents"}
        </button>
      </form>
      <div className="activity-panel">
        <div className="activity-filters" aria-label="Activity filters">
          {activityFilterOptions.map((option) => (
            <button
              aria-pressed={activityFilter === option.id}
              className={activityFilter === option.id ? "is-selected" : ""}
              key={option.id}
              onClick={() => onFilterChange(option.id)}
              type="button"
            >
              <option.icon size={13} />
              {option.label}
            </button>
          ))}
        </div>
        <div className="activity-feed">
          {events.map((event) => (
            <article className={`event-row tone-${event.tone}`} key={event.id}>
              <span className="event-time">{event.time}</span>
              <div>
                <strong>{event.title}</strong>
                <p>{event.summary}</p>
              </div>
              <span className="event-role">{getShortRoleName(event.roleId)}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
