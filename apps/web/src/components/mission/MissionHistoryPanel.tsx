import { Archive, ChevronRight } from "lucide-react";
import { formatHistoryTimestamp } from "../../utils/time-format.js";

type MissionHistorySummaryView = {
  controllerId?: string;
  currentStage?: string;
  gitOperationCount: number;
  id: string;
  kind: string;
  reviewPacketCount: number;
  status: string;
  title: string;
  toolCallCount: number;
  updatedAt: string;
  attempt?: number;
};

type MissionHistoryPanelProps<TSummary extends MissionHistorySummaryView> = {
  history: readonly TSummary[];
  isLoading: boolean;
  onSelect: (summary: TSummary) => void | Promise<void>;
  selectedHistoryId: string;
};

export function MissionHistoryPanel<TSummary extends MissionHistorySummaryView>({
  history,
  isLoading,
  onSelect,
  selectedHistoryId
}: MissionHistoryPanelProps<TSummary>) {
  return (
    <section className="mission-history-band" aria-label="Mission run history">
      <div className="mission-history-heading">
        <div>
          <Archive size={16} />
          <h2>Mission history</h2>
        </div>
        <span>{Math.max(0, history.length - 1)} archived</span>
      </div>
      <div className="mission-history-list">
        {history.length > 0 ? history.slice(0, 8).map((item) => (
          <button
            aria-pressed={selectedHistoryId === item.id}
            className={selectedHistoryId === item.id ? "mission-history-row is-selected" : "mission-history-row"}
            disabled={isLoading}
            key={item.id}
            onClick={() => void onSelect(item)}
            type="button"
          >
            <span className={`history-status status-${item.status}`}>{item.kind === "current" ? "Current" : item.status}</span>
            <span className="history-run-copy">
              <strong>{item.title}</strong>
              <small>
                {item.controllerId ? `Run ${item.attempt ?? 1} · ${item.currentStage?.replaceAll("_", " ")}` : "Saved intake"}
              </small>
            </span>
            <span className="history-evidence-count">
              {item.toolCallCount + item.gitOperationCount + item.reviewPacketCount} evidence
            </span>
            <time dateTime={item.updatedAt}>{formatHistoryTimestamp(item.updatedAt)}</time>
            <ChevronRight size={15} />
          </button>
        )) : (
          <p className="mission-history-empty">History is available when the orchestrator is connected.</p>
        )}
      </div>
    </section>
  );
}
