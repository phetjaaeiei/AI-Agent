import type { RoleId } from "./roles.js";

export const ARTIFACT_TYPES = [
  "mission_charter",
  "prd",
  "user_story",
  "technical_design",
  "ui_spec",
  "code_patch",
  "test_plan",
  "test_result",
  "qa_report",
  "deployment_log",
  "release_note",
  "final_report",
  "memory_note",
  "risk_register",
  "assumption_log",
  "conflict_record"
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export type ArtifactStatus = "draft" | "reviewing" | "verified" | "rejected" | "superseded";

export type EvidenceRef = {
  id: string;
  kind: "brief" | "ticket" | "file" | "diff" | "test" | "log" | "screenshot" | "deployment" | "cost" | "artifact";
  label: string;
  uri?: string;
};

export type Artifact = {
  id: string;
  missionId: string;
  taskId?: string;
  createdByRoleId: RoleId;
  type: ArtifactType;
  title: string;
  summary: string;
  status: ArtifactStatus;
  evidence: readonly EvidenceRef[];
  version: number;
  createdAt: string;
};
