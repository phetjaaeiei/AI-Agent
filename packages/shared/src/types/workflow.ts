import type { ArtifactType } from "./artifacts.js";
import type { RoleId } from "./roles.js";

export const MISSION_PHASES = [
  "created",
  "intake",
  "executive_triage",
  "discovery",
  "planning",
  "design",
  "architecture",
  "implementation",
  "qa",
  "fix_loop",
  "release",
  "monitoring",
  "final_report",
  "completed",
  "needs_setup",
  "blocked",
  "cancelled",
  "failed"
] as const;

export type MissionPhase = (typeof MISSION_PHASES)[number];

export const OPERATIONAL_MISSION_PHASES = [
  "intake",
  "executive_triage",
  "discovery",
  "planning",
  "design",
  "architecture",
  "implementation",
  "qa",
  "fix_loop",
  "release",
  "monitoring",
  "final_report"
] as const satisfies readonly MissionPhase[];

export type OperationalMissionPhase = (typeof OPERATIONAL_MISSION_PHASES)[number];

export type MissionStatus =
  | "draft"
  | "running"
  | "needs_setup"
  | "blocked"
  | "completed"
  | "cancelled"
  | "failed";

export type TaskStatus =
  | "queued"
  | "assigned"
  | "running"
  | "waiting_for_dependency"
  | "blocked"
  | "reviewing"
  | "failed"
  | "passed"
  | "completed"
  | "cancelled";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RaciAssignment = {
  phase: OperationalMissionPhase;
  responsible: readonly RoleId[];
  accountable: RoleId;
  consulted: readonly RoleId[];
  informed: readonly RoleId[];
};

export type QualityGateId =
  | "planning_gate"
  | "technical_design_gate"
  | "implementation_gate"
  | "qa_gate"
  | "release_gate"
  | "final_report_gate";

export type QualityGateDefinition = {
  id: QualityGateId;
  name: string;
  phase: OperationalMissionPhase;
  minimumScore: number;
  requiredArtifacts: readonly ArtifactType[];
  verifierRoleIds: readonly RoleId[];
  passCriteria: readonly string[];
};

export type Task = {
  id: string;
  missionId: string;
  title: string;
  description: string;
  ownerRoleId: RoleId;
  phase: OperationalMissionPhase;
  status: TaskStatus;
  priority: "low" | "normal" | "high" | "urgent";
  dependencies: readonly string[];
  artifactIds: readonly string[];
  acceptanceCriteria: readonly string[];
  riskLevel: RiskLevel;
};
