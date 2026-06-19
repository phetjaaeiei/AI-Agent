import type { RoleId } from "./roles.js";

export type SkillLevel = 1 | 2 | 3 | 4 | 5;

export const SKILL_DIMENSIONS = [
  "strategy",
  "product",
  "architecture",
  "technical",
  "delivery",
  "risk",
  "peopleCapacity",
  "finance",
  "communication",
  "requirements",
  "businessRules",
  "uxFlow",
  "prioritization",
  "data",
  "edgeCases",
  "writing",
  "uxArchitecture",
  "uiCraft",
  "designSystem",
  "accessibility",
  "frontend",
  "backend",
  "database",
  "aiPrompt",
  "integration",
  "codeReview",
  "testing",
  "testStrategy",
  "manualTesting",
  "automation",
  "security",
  "performance",
  "defectTriage",
  "cicd",
  "cloud",
  "infrastructure",
  "monitoring",
  "rollback",
  "releaseComms",
  "compliance",
  "documentation",
  "customerImpact",
  "memory"
] as const;

export type SkillDimension = (typeof SKILL_DIMENSIONS)[number];

export type SkillProfile = {
  roleId: RoleId;
  skills: Partial<Record<SkillDimension, SkillLevel>>;
  primarySkills: readonly SkillDimension[];
  approvalRights: readonly string[];
  reviewStrengths: readonly SkillDimension[];
};

export type RoleSkillMatrix = Record<RoleId, SkillProfile>;
