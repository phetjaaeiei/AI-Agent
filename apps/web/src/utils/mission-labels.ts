export type MissionLifecycleStatus = "draft" | "saved" | "running" | "blocked" | "delivered";

export type MissionRiskSummary = {
  level: string;
};

export type MissionAutonomyMode = "needs_setup" | "review_first" | "autopilot" | string;

export const missionStateLabel: Record<MissionLifecycleStatus, string> = {
  draft: "Draft",
  saved: "Saved",
  running: "Running",
  blocked: "Blocked",
  delivered: "Delivered"
};

export function missionRiskLabel(missionPlan: { risks: readonly MissionRiskSummary[] }): string {
  if (missionPlan.risks.some((risk) => risk.level === "high")) return "High";
  if (missionPlan.risks.some((risk) => risk.level === "medium")) return "Medium";
  return "Low";
}

export function missionAutonomyLabel(mode: MissionAutonomyMode): string {
  if (mode === "needs_setup") return "Needs setup";
  if (mode === "review_first") return "Review first";
  return "Autopilot";
}
