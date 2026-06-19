import type { MissionPhase } from "./workflow.js";
import type { RoleId } from "./roles.js";

export type AuditSeverity = "info" | "success" | "warning" | "error";

export type AuditEventType =
  | "mission.created"
  | "phase.started"
  | "phase.completed"
  | "role.assigned"
  | "task.created"
  | "task.updated"
  | "agent.started"
  | "agent.completed"
  | "tool.requested"
  | "tool.completed"
  | "tool.failed"
  | "artifact.created"
  | "artifact.verified"
  | "qa.failed"
  | "qa.passed"
  | "deployment.started"
  | "deployment.completed"
  | "risk.created"
  | "assumption.created"
  | "gate.passed"
  | "gate.failed"
  | "mission.completed";

export type MissionEvent = {
  id: string;
  missionId: string;
  type: AuditEventType;
  phase: MissionPhase;
  roleId?: RoleId;
  taskId?: string;
  artifactId?: string;
  severity: AuditSeverity;
  title: string;
  summary: string;
  createdAt: string;
};
