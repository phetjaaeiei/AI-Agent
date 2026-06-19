import { ROLE_IDS } from "./roles.js";
import type { RoleId } from "./roles.js";

const roleIdSet = new Set<string>(ROLE_IDS);

export const REVIEW_PACKET_SCHEMA_VERSION = 1;
export const REVIEW_PACKET_STORE_SCHEMA_VERSION = 1;

export const REVIEW_REQUIREMENT_IDS = [
  "changed_files",
  "passing_tests",
  "git_status",
  "git_diff",
  "commit_plan",
  "reviewer_approval"
] as const;

export const DEFAULT_LOCAL_CI_COMMANDS = [
  "npm run typecheck",
  "npm run verify:foundation",
  "npm run verify:agent-runtime",
  "npm run verify:tool-runner",
  "npm run verify:git-runner",
  "npm run verify:orchestrator",
  "npm run build:web"
] as const;

export type ReviewPacketStatus = "draft" | "blocked" | "needs_revision" | "ready" | "delivered";
export type ReviewRequirementId = (typeof REVIEW_REQUIREMENT_IDS)[number];
export type ReviewRequirementStatus = "pass" | "missing" | "block";
export type ReviewerDecision = "pass" | "revise" | "block";

export type ReviewEvidenceReferences = {
  artifactRecordIds: readonly string[];
  artifactContentIds: readonly string[];
  toolCallIds: readonly string[];
  gitOperationIds: readonly string[];
};

export type ReviewRequirement = {
  id: ReviewRequirementId;
  label: string;
  status: ReviewRequirementStatus;
  summary: string;
  evidenceIds: readonly string[];
};

export type ReviewerRecord = {
  reviewerRoleId: RoleId;
  decision: ReviewerDecision;
  summary: string;
  reviewedAt: string;
};

export type LocalCiCommandResult = {
  command: string;
  toolCallId: string;
  status: "passed" | "failed" | "blocked";
  exitCode?: number;
  summary: string;
};

export type LocalCiRun = {
  profileId: "default_local";
  status: "passed" | "failed" | "blocked";
  commands: readonly LocalCiCommandResult[];
  startedAt: string;
  completedAt: string;
};

export type ReviewPacket = {
  schemaVersion: 1;
  id: string;
  missionId: string;
  taskId: string;
  createdByRoleId: RoleId;
  status: ReviewPacketStatus;
  summary: string;
  evidence: ReviewEvidenceReferences;
  requirements: readonly ReviewRequirement[];
  requiredReviewerRoleIds: readonly RoleId[];
  reviews: readonly ReviewerRecord[];
  risks: readonly string[];
  ciRun?: LocalCiRun;
  deliveryArtifactRecordId?: string;
  deliveryArtifactContentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewPacketCreateRequest = {
  missionId: string;
  taskId: string;
  roleId: RoleId;
};

export type ReviewDecisionRequest = {
  reviewerRoleId: RoleId;
  decision: ReviewerDecision;
  summary: string;
};

export type ReviewPacketStoreSnapshot = {
  schemaVersion: 1;
  packets: readonly ReviewPacket[];
};

export function createEmptyReviewPacketStoreSnapshot(): ReviewPacketStoreSnapshot {
  return { schemaVersion: REVIEW_PACKET_STORE_SCHEMA_VERSION, packets: [] };
}

export function restoreReviewPacketStoreSnapshot(value: unknown): ReviewPacketStoreSnapshot {
  if (!value || typeof value !== "object") return createEmptyReviewPacketStoreSnapshot();
  const snapshot = value as Partial<ReviewPacketStoreSnapshot>;
  if (snapshot.schemaVersion !== REVIEW_PACKET_STORE_SCHEMA_VERSION) return createEmptyReviewPacketStoreSnapshot();
  return {
    schemaVersion: REVIEW_PACKET_STORE_SCHEMA_VERSION,
    packets: Array.isArray(snapshot.packets) ? snapshot.packets.filter(isReviewPacket) : []
  };
}

export function isReviewPacketCreateRequest(value: unknown): value is ReviewPacketCreateRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ReviewPacketCreateRequest>;
  return (
    typeof request.missionId === "string" &&
    typeof request.taskId === "string" &&
    typeof request.roleId === "string" &&
    roleIdSet.has(request.roleId)
  );
}

export function isReviewDecisionRequest(value: unknown): value is ReviewDecisionRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ReviewDecisionRequest>;
  return (
    typeof request.reviewerRoleId === "string" &&
    roleIdSet.has(request.reviewerRoleId) &&
    ["pass", "revise", "block"].includes(request.decision ?? "") &&
    typeof request.summary === "string"
  );
}

export function isReviewPacket(value: unknown): value is ReviewPacket {
  if (!value || typeof value !== "object") return false;
  const packet = value as Partial<ReviewPacket>;
  return (
    packet.schemaVersion === REVIEW_PACKET_SCHEMA_VERSION &&
    typeof packet.id === "string" &&
    typeof packet.missionId === "string" &&
    typeof packet.taskId === "string" &&
    typeof packet.createdByRoleId === "string" &&
    roleIdSet.has(packet.createdByRoleId) &&
    ["draft", "blocked", "needs_revision", "ready", "delivered"].includes(packet.status ?? "") &&
    Array.isArray(packet.requirements) &&
    Array.isArray(packet.reviews) &&
    typeof packet.createdAt === "string" &&
    typeof packet.updatedAt === "string"
  );
}
