import type { MissionPhase, RiskLevel, RoleId } from "../../../shared/src/index.js";

export type MissionBenchmarkCategory =
  | "simple_ui_feature"
  | "crud_backend_feature"
  | "bug_fix"
  | "test_improvement"
  | "refactor_no_behavior_change"
  | "deployment_only"
  | "security_sensitive"
  | "ambiguous_brief"
  | "multi_role_full_feature"
  | "missing_integration";

export type MissionBenchmark = {
  id: string;
  category: MissionBenchmarkCategory;
  title: string;
  brief: string;
  expectedRoles: readonly RoleId[];
  expectedPhases: readonly MissionPhase[];
  riskLevel: RiskLevel;
  expectedGateIds: readonly string[];
  expectedFailureMode?: string;
};

export const MISSION_BENCHMARKS = [
  {
    id: "bench_simple_ui_feature",
    category: "simple_ui_feature",
    title: "Add sales dashboard filter",
    brief: "Add a date range filter to the sales dashboard and keep the table export working.",
    expectedRoles: ["product_manager", "frontend_developer", "automation_qa", "manual_qa", "tech_lead"],
    expectedPhases: ["intake", "planning", "implementation", "qa", "final_report"],
    riskLevel: "medium",
    expectedGateIds: ["planning_gate", "implementation_gate", "qa_gate", "final_report_gate"]
  },
  {
    id: "bench_crud_backend_feature",
    category: "crud_backend_feature",
    title: "Create project tags API",
    brief: "Build CRUD APIs for project tags with validation and tests.",
    expectedRoles: ["product_manager", "lead_ba", "backend_developer", "database_engineer", "automation_qa", "tech_lead"],
    expectedPhases: ["intake", "discovery", "planning", "architecture", "implementation", "qa", "final_report"],
    riskLevel: "medium",
    expectedGateIds: ["planning_gate", "technical_design_gate", "implementation_gate", "qa_gate", "final_report_gate"]
  },
  {
    id: "bench_bug_fix",
    category: "bug_fix",
    title: "Fix failed login redirect",
    brief: "Users are redirected to the wrong page after session expiry. Fix it and add regression coverage.",
    expectedRoles: ["business_analyst", "tech_lead", "frontend_developer", "automation_qa", "manual_qa"],
    expectedPhases: ["intake", "discovery", "implementation", "qa", "final_report"],
    riskLevel: "high",
    expectedGateIds: ["implementation_gate", "qa_gate", "final_report_gate"]
  },
  {
    id: "bench_test_improvement",
    category: "test_improvement",
    title: "Add API contract tests",
    brief: "Improve test coverage for the existing employee KPI endpoint without changing behavior.",
    expectedRoles: ["tech_lead", "backend_developer", "automation_qa", "qa_lead"],
    expectedPhases: ["intake", "planning", "implementation", "qa", "final_report"],
    riskLevel: "low",
    expectedGateIds: ["implementation_gate", "qa_gate", "final_report_gate"]
  },
  {
    id: "bench_refactor",
    category: "refactor_no_behavior_change",
    title: "Refactor shared date helpers",
    brief: "Refactor duplicated date formatting helpers without changing user-facing behavior.",
    expectedRoles: ["tech_lead", "fullstack_developer", "automation_qa", "qa_lead"],
    expectedPhases: ["intake", "architecture", "implementation", "qa", "final_report"],
    riskLevel: "medium",
    expectedGateIds: ["technical_design_gate", "implementation_gate", "qa_gate", "final_report_gate"]
  },
  {
    id: "bench_deployment_only",
    category: "deployment_only",
    title: "Deploy staging build",
    brief: "Deploy the current main branch to staging and verify the health checks.",
    expectedRoles: ["devops_lead", "sre", "release_manager"],
    expectedPhases: ["intake", "release", "monitoring", "final_report"],
    riskLevel: "medium",
    expectedGateIds: ["release_gate", "final_report_gate"]
  },
  {
    id: "bench_security_sensitive",
    category: "security_sensitive",
    title: "Harden API token handling",
    brief: "Review and harden API token handling. Do not expose secrets in logs.",
    expectedRoles: ["security_engineer", "security_qa", "backend_developer", "tech_lead", "qa_lead"],
    expectedPhases: ["intake", "architecture", "implementation", "qa", "final_report"],
    riskLevel: "critical",
    expectedGateIds: ["technical_design_gate", "implementation_gate", "qa_gate", "final_report_gate"]
  },
  {
    id: "bench_ambiguous_brief",
    category: "ambiguous_brief",
    title: "Make reports better",
    brief: "Make reports better and faster.",
    expectedRoles: ["product_manager", "lead_ba", "data_analyst", "tech_lead"],
    expectedPhases: ["intake", "discovery", "planning"],
    riskLevel: "high",
    expectedGateIds: ["planning_gate"],
    expectedFailureMode: "high ambiguity should create assumptions and block implementation until scope is clear"
  },
  {
    id: "bench_multi_role_full_feature",
    category: "multi_role_full_feature",
    title: "Build sales analytics dashboard",
    brief: "Build a sales analytics dashboard with filters, export CSV, automated tests, and staging deployment.",
    expectedRoles: ["ceo", "product_manager", "lead_ba", "product_designer", "tech_lead", "frontend_developer", "backend_developer", "automation_qa", "manual_qa", "devops_lead", "sre", "technical_writer"],
    expectedPhases: ["intake", "executive_triage", "discovery", "planning", "design", "architecture", "implementation", "qa", "release", "monitoring", "final_report"],
    riskLevel: "high",
    expectedGateIds: ["planning_gate", "technical_design_gate", "implementation_gate", "qa_gate", "release_gate", "final_report_gate"]
  },
  {
    id: "bench_missing_integration",
    category: "missing_integration",
    title: "Open PR without Git integration",
    brief: "Create a branch, push code, and open a PR, but the Git provider is not connected.",
    expectedRoles: ["tech_lead", "devops_lead", "release_manager"],
    expectedPhases: ["intake", "needs_setup"],
    riskLevel: "high",
    expectedGateIds: [],
    expectedFailureMode: "mission should enter needs_setup with missing Git integration evidence"
  }
] as const satisfies readonly MissionBenchmark[];
