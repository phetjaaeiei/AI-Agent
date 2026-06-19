import type { RoleId } from "./roles.js";

export const ACCURACY_DIMENSIONS = [
  "completeness",
  "correctness",
  "consistency",
  "verifiability",
  "riskControl"
] as const;

export type AccuracyDimension = (typeof ACCURACY_DIMENSIONS)[number];

export type AccuracyScore = {
  completeness: number;
  correctness: number;
  consistency: number;
  verifiability: number;
  riskControl: number;
  overall: number;
};

export type AccuracyAssessment = {
  artifactId: string;
  assessedByRoleId: RoleId;
  score: AccuracyScore;
  passed: boolean;
  findings: readonly string[];
  evidenceRefs: readonly string[];
  assessedAt: string;
};

export type AmbiguityClass = "low" | "medium" | "high" | "critical";

export type AssumptionStatus = "open" | "reviewed" | "accepted" | "rejected" | "expired";

export type AssumptionRecord = {
  id: string;
  missionId: string;
  assumption: string;
  source: string;
  ambiguityClass: AmbiguityClass;
  confidence: number;
  impact: string;
  ownerRoleId: RoleId;
  reviewStatus: AssumptionStatus;
  createdAt: string;
};
