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

export type CreateAssumptionsFromDraftInput = {
  missionId: string;
  draft: string;
  previousAssumptions?: readonly AssumptionRecord[];
  source?: string;
  ambiguityClass?: AmbiguityClass;
  confidence?: number;
  impact?: string;
  ownerRoleId?: RoleId;
  createdAt?: string;
  limit?: number;
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

export function createAssumptionsFromDraft(input: CreateAssumptionsFromDraftInput): AssumptionRecord[] {
  const previousByText = new Map(
    (input.previousAssumptions ?? []).map((record) => [normalizeAssumption(record.assumption), record])
  );
  const seen = new Set<string>();
  const assumptions = input.draft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      const normalized = normalizeAssumption(line);

      if (!normalized || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    })
    .slice(0, input.limit ?? 12);

  return assumptions.map((assumption) => {
    const previous = previousByText.get(normalizeAssumption(assumption));

    if (previous?.missionId === input.missionId) {
      return previous;
    }

    return createAssumptionRecord({
      missionId: input.missionId,
      assumption,
      source: input.source ?? "Mission intake",
      ambiguityClass: input.ambiguityClass ?? "medium",
      confidence: input.confidence ?? 70,
      impact: input.impact ?? "Verify before affected implementation evidence is accepted.",
      ownerRoleId: input.ownerRoleId ?? "lead_ba",
      ...(input.createdAt ? { createdAt: input.createdAt } : {})
    });
  });
}

export function formatAssumptionDraft(assumptions: readonly AssumptionRecord[]): string {
  return assumptions.map((record) => record.assumption).join("\n");
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

function normalizeAssumption(assumption: string): string {
  return assumption.trim().replace(/\s+/g, " ").toLowerCase();
}
