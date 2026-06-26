import { Activity, AlertTriangle, Search, UsersRound, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { missionAutonomyLabel, missionRiskLabel } from "../../utils/mission-labels.js";
import type { MissionAutonomyMode, MissionRiskSummary } from "../../utils/mission-labels.js";

export type MissionHudPlan = {
  autonomyMode: MissionAutonomyMode;
  confidence: number;
  recommendedRoleIds: readonly unknown[];
  risks: readonly MissionRiskSummary[];
};

export function TopHud({
  missionPlan,
  missionTitle
}: {
  missionPlan: MissionHudPlan;
  missionTitle: string;
}) {
  const risk = missionRiskLabel(missionPlan);

  return (
    <header className="top-hud">
      <div className="mission-id">
        <span>Mission</span>
        <strong>{missionTitle}</strong>
      </div>
      <div className="hud-metrics" aria-label="Mission metrics">
        <HudMetric icon={Zap} label="Mode" value={missionAutonomyLabel(missionPlan.autonomyMode)} tone="blue" />
        <HudMetric icon={UsersRound} label="Roles" value={`${missionPlan.recommendedRoleIds.length} mapped`} tone="green" />
        <HudMetric icon={AlertTriangle} label="Risk" value={risk} tone={risk === "Low" ? "green" : "amber"} />
        <HudMetric icon={Activity} label="Confidence" value={`${missionPlan.confidence}%`} tone="neutral" />
      </div>
      <button className="search-button" type="button">
        <Search size={16} />
        Search commands
      </button>
    </header>
  );
}

function HudMetric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <div className={`hud-metric tone-${tone}`}>
      <Icon size={14} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
