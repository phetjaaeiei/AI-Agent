import type { RoleId, RoleSkillMatrix, SkillDimension, SkillLevel } from "../../../shared/src/index.js";

const profile = (
  roleId: RoleId,
  skills: Partial<Record<SkillDimension, SkillLevel>>,
  approvalRights: readonly string[],
  reviewStrengths: readonly SkillDimension[]
) => ({
  roleId,
  skills,
  primarySkills: Object.entries(skills)
    .filter(([, level]) => typeof level === "number" && level >= 4)
    .map(([dimension]) => dimension as SkillDimension),
  approvalRights,
  reviewStrengths
});

export const ROLE_SKILL_MATRIX = {
  ceo: profile("ceo", { strategy: 5, product: 4, delivery: 4, risk: 5, peopleCapacity: 4, finance: 4, communication: 5 }, ["mission outcome", "final report"], ["strategy", "risk", "communication"]),
  coo: profile("coo", { strategy: 4, product: 3, delivery: 5, risk: 5, peopleCapacity: 5, finance: 4, communication: 4 }, ["operating plan", "release readiness"], ["delivery", "risk", "peopleCapacity"]),
  cto: profile("cto", { strategy: 4, product: 3, technical: 5, delivery: 4, risk: 5, communication: 4 }, ["architecture", "technical risk"], ["technical", "risk", "codeReview"]),
  cpo: profile("cpo", { strategy: 4, product: 5, delivery: 4, risk: 4, communication: 5, requirements: 5, prioritization: 5 }, ["product scope", "acceptance criteria"], ["product", "requirements", "prioritization"]),
  chief_of_staff: profile("chief_of_staff", { strategy: 4, delivery: 5, risk: 4, peopleCapacity: 4, finance: 3, communication: 5, writing: 5 }, ["status integrity", "final narrative"], ["delivery", "communication", "writing"]),
  engineering_director: profile("engineering_director", { technical: 4, delivery: 5, risk: 4, peopleCapacity: 5, communication: 4, codeReview: 4 }, ["engineering allocation"], ["delivery", "peopleCapacity", "technical"]),
  product_manager: profile("product_manager", { requirements: 5, businessRules: 4, uxFlow: 4, prioritization: 5, data: 3, edgeCases: 4, writing: 5 }, ["PRD", "scope"], ["requirements", "prioritization", "writing"]),
  project_manager: profile("project_manager", { requirements: 3, delivery: 5, prioritization: 4, edgeCases: 3, writing: 4, communication: 5 }, ["timeline", "dependencies"], ["delivery", "communication"]),
  scrum_master: profile("scrum_master", { delivery: 4, edgeCases: 3, writing: 4, communication: 5, defectTriage: 4 }, ["blocker process"], ["delivery", "communication", "defectTriage"]),
  lead_ba: profile("lead_ba", { requirements: 5, businessRules: 5, uxFlow: 4, prioritization: 4, data: 4, edgeCases: 5, writing: 5 }, ["business rules", "acceptance matrix"], ["requirements", "businessRules", "edgeCases"]),
  business_analyst: profile("business_analyst", { requirements: 4, businessRules: 5, uxFlow: 3, prioritization: 3, data: 3, edgeCases: 5, writing: 4 }, ["requirement detail"], ["businessRules", "edgeCases", "writing"]),
  ux_researcher: profile("ux_researcher", { requirements: 4, businessRules: 3, uxFlow: 5, prioritization: 3, data: 3, edgeCases: 4, writing: 4 }, ["user journey assumptions"], ["uxFlow", "requirements", "edgeCases"]),
  data_analyst: profile("data_analyst", { requirements: 3, businessRules: 3, data: 5, edgeCases: 4, writing: 3 }, ["metrics and event taxonomy"], ["data", "edgeCases"]),
  product_designer: profile("product_designer", { uxArchitecture: 5, uiCraft: 4, designSystem: 3, accessibility: 4, uxFlow: 5, writing: 4, frontend: 3 }, ["flow and screen behavior"], ["uxArchitecture", "uxFlow", "accessibility"]),
  ui_designer: profile("ui_designer", { uxArchitecture: 4, uiCraft: 5, designSystem: 4, accessibility: 4, writing: 3, frontend: 3 }, ["visual design states"], ["uiCraft", "designSystem", "accessibility"]),
  design_system_designer: profile("design_system_designer", { uxArchitecture: 3, uiCraft: 5, designSystem: 5, accessibility: 5, frontend: 4 }, ["component consistency"], ["designSystem", "accessibility", "uiCraft"]),
  ux_writer: profile("ux_writer", { uxArchitecture: 4, uiCraft: 2, designSystem: 3, accessibility: 4, writing: 5, communication: 5 }, ["labels, errors, empty states"], ["writing", "communication", "accessibility"]),
  solution_architect: profile("solution_architect", { architecture: 5, technical: 5, frontend: 3, backend: 5, database: 4, aiPrompt: 3, integration: 4, codeReview: 4, testing: 3, risk: 5 }, ["system design"], ["technical", "backend", "risk"]),
  tech_lead: profile("tech_lead", { architecture: 5, technical: 5, frontend: 4, backend: 4, database: 4, aiPrompt: 3, integration: 4, codeReview: 5, testing: 4, risk: 4 }, ["implementation plan", "code quality"], ["codeReview", "technical", "testing"]),
  fullstack_developer: profile("fullstack_developer", { technical: 3, frontend: 4, backend: 4, database: 3, aiPrompt: 2, integration: 3, codeReview: 3, testing: 3 }, ["feature implementation"], ["frontend", "backend"]),
  frontend_developer: profile("frontend_developer", { technical: 2, frontend: 5, backend: 2, database: 1, aiPrompt: 1, integration: 2, codeReview: 3, testing: 3, accessibility: 4 }, ["UI implementation"], ["frontend", "accessibility"]),
  backend_developer: profile("backend_developer", { technical: 3, frontend: 1, backend: 5, database: 4, aiPrompt: 2, integration: 4, codeReview: 3, testing: 3, security: 3 }, ["API/service implementation"], ["backend", "database", "integration"]),
  database_engineer: profile("database_engineer", { technical: 3, backend: 3, database: 5, integration: 2, codeReview: 3, testing: 3, performance: 4 }, ["schema, migration, indexes"], ["database", "performance"]),
  ai_ml_engineer: profile("ai_ml_engineer", { technical: 3, frontend: 2, backend: 3, database: 2, aiPrompt: 5, integration: 3, codeReview: 3, testing: 4 }, ["agent/model behavior"], ["aiPrompt", "testing"]),
  prompt_engineer: profile("prompt_engineer", { technical: 2, backend: 2, aiPrompt: 5, integration: 2, codeReview: 2, testing: 4, writing: 5 }, ["prompt templates", "eval cases"], ["aiPrompt", "writing", "testing"]),
  integration_engineer: profile("integration_engineer", { technical: 3, frontend: 2, backend: 4, database: 3, aiPrompt: 2, integration: 5, codeReview: 3, testing: 3, security: 3 }, ["external API adapters"], ["integration", "backend"]),
  qa_lead: profile("qa_lead", { testStrategy: 5, manualTesting: 4, automation: 4, security: 3, performance: 3, accessibility: 4, defectTriage: 5, communication: 4 }, ["QA signoff"], ["testStrategy", "defectTriage"]),
  manual_qa: profile("manual_qa", { testStrategy: 3, manualTesting: 5, automation: 2, security: 2, performance: 2, accessibility: 3, defectTriage: 4, edgeCases: 5 }, ["manual behavior report"], ["manualTesting", "edgeCases"]),
  automation_qa: profile("automation_qa", { testStrategy: 4, manualTesting: 3, automation: 5, security: 2, performance: 3, accessibility: 3, defectTriage: 4, testing: 5 }, ["test automation result"], ["automation", "testing"]),
  security_qa: profile("security_qa", { testStrategy: 3, manualTesting: 2, automation: 3, security: 5, performance: 2, accessibility: 2, defectTriage: 4 }, ["security findings"], ["security", "defectTriage"]),
  performance_qa: profile("performance_qa", { testStrategy: 3, manualTesting: 2, automation: 4, security: 2, performance: 5, accessibility: 2, defectTriage: 4 }, ["performance report"], ["performance", "automation"]),
  accessibility_qa: profile("accessibility_qa", { testStrategy: 3, manualTesting: 4, automation: 3, security: 2, performance: 2, accessibility: 5, defectTriage: 4 }, ["accessibility signoff"], ["accessibility", "manualTesting"]),
  devops_lead: profile("devops_lead", { cicd: 5, cloud: 4, infrastructure: 4, monitoring: 4, security: 4, rollback: 5, releaseComms: 3, risk: 5 }, ["deployment plan"], ["cicd", "rollback", "risk"]),
  sre: profile("sre", { cicd: 4, cloud: 4, infrastructure: 4, monitoring: 5, security: 3, rollback: 5, releaseComms: 3, performance: 4 }, ["health check", "rollback signal"], ["monitoring", "rollback"]),
  cloud_architect: profile("cloud_architect", { cicd: 4, cloud: 5, infrastructure: 5, monitoring: 4, security: 4, rollback: 4 }, ["cloud architecture"], ["cloud", "infrastructure"]),
  release_manager: profile("release_manager", { cicd: 4, cloud: 3, infrastructure: 3, monitoring: 4, security: 3, rollback: 5, releaseComms: 5, delivery: 5 }, ["release readiness"], ["releaseComms", "rollback", "delivery"]),
  security_engineer: profile("security_engineer", { cicd: 3, cloud: 3, infrastructure: 4, monitoring: 3, security: 5, rollback: 4, risk: 5 }, ["runtime/security approval"], ["security", "risk"]),
  hr_manager: profile("hr_manager", { peopleCapacity: 5, finance: 2, compliance: 2, documentation: 2, customerImpact: 2, memory: 3, communication: 4 }, ["role capacity plan"], ["peopleCapacity"]),
  finance_manager: profile("finance_manager", { peopleCapacity: 2, finance: 5, compliance: 3, documentation: 3, customerImpact: 3, memory: 2, communication: 4 }, ["cost budget"], ["finance"]),
  legal_compliance_agent: profile("legal_compliance_agent", { peopleCapacity: 2, finance: 3, compliance: 5, documentation: 4, customerImpact: 4, memory: 3, communication: 4, risk: 5 }, ["compliance risk"], ["compliance", "risk"]),
  customer_success_agent: profile("customer_success_agent", { peopleCapacity: 2, finance: 2, compliance: 3, documentation: 4, customerImpact: 5, memory: 3, communication: 5 }, ["customer-facing note"], ["customerImpact", "communication"]),
  technical_writer: profile("technical_writer", { technical: 2, documentation: 5, customerImpact: 4, memory: 4, communication: 5, writing: 5 }, ["documentation"], ["documentation", "writing"]),
  knowledge_manager: profile("knowledge_manager", { technical: 3, finance: 3, compliance: 3, documentation: 4, customerImpact: 3, memory: 5, communication: 4 }, ["durable memory"], ["memory", "documentation"])
} satisfies RoleSkillMatrix;

export function getRoleSkillProfile(roleId: RoleId) {
  return ROLE_SKILL_MATRIX[roleId];
}
