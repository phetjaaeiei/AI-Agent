import type { AccuracyScore, QualityGateDefinition } from "../../../shared/src/index.js";

export type AccuracyScoreInput = Omit<AccuracyScore, "overall">;

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export function calculateAccuracyScore(input: AccuracyScoreInput): AccuracyScore {
  const completeness = clampScore(input.completeness);
  const correctness = clampScore(input.correctness);
  const consistency = clampScore(input.consistency);
  const verifiability = clampScore(input.verifiability);
  const riskControl = clampScore(input.riskControl);
  const overall = clampScore(
    completeness * 0.22 +
      correctness * 0.28 +
      consistency * 0.18 +
      verifiability * 0.20 +
      riskControl * 0.12
  );

  return {
    completeness,
    correctness,
    consistency,
    verifiability,
    riskControl,
    overall
  };
}

export function passesQualityGate(score: AccuracyScore, gate: QualityGateDefinition): boolean {
  return score.overall >= gate.minimumScore;
}

export function explainGateResult(score: AccuracyScore, gate: QualityGateDefinition): string {
  if (passesQualityGate(score, gate)) {
    return `${gate.name} passed with score ${score.overall}/${gate.minimumScore}.`;
  }

  return `${gate.name} failed with score ${score.overall}/${gate.minimumScore}.`;
}
