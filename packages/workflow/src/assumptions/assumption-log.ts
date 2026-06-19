import type {
  AmbiguityClass,
  AssumptionRecord,
  AssumptionStatus,
  RoleId
} from "../../../shared/src/index.js";

export type CreateAssumptionInput = {
  missionId: string;
  assumption: string;
  source: string;
  ambiguityClass: AmbiguityClass;
  confidence: number;
  impact: string;
  ownerRoleId: RoleId;
  reviewStatus?: AssumptionStatus;
  createdAt?: string;
};

export function createAssumptionRecord(input: CreateAssumptionInput): AssumptionRecord {
  return {
    id: `assumption_${input.missionId}_${Math.abs(hashText(input.assumption)).toString(36)}`,
    missionId: input.missionId,
    assumption: input.assumption,
    source: input.source,
    ambiguityClass: input.ambiguityClass,
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
    impact: input.impact,
    ownerRoleId: input.ownerRoleId,
    reviewStatus: input.reviewStatus ?? "open",
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export function shouldBlockForAmbiguity(ambiguityClass: AmbiguityClass): boolean {
  return ambiguityClass === "high" || ambiguityClass === "critical";
}

export function recommendedAmbiguityAction(ambiguityClass: AmbiguityClass): string {
  switch (ambiguityClass) {
    case "low":
      return "Assume, log, and continue.";
    case "medium":
      return "Choose a default, log assumption, and mark reviewable.";
    case "high":
      return "Block phase or request setup according to mission policy.";
    case "critical":
      return "Stop mission phase and escalate to accountable role.";
  }
}

function hashText(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}
