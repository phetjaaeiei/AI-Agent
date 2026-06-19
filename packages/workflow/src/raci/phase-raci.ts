import type { OperationalMissionPhase, RaciAssignment } from "../../../shared/src/index.js";

export const PHASE_RACI = [
  {
    phase: "intake",
    responsible: ["product_manager", "lead_ba"],
    accountable: "cpo",
    consulted: ["ceo", "cto"],
    informed: ["chief_of_staff"]
  },
  {
    phase: "executive_triage",
    responsible: ["ceo", "coo", "cto", "cpo"],
    accountable: "ceo",
    consulted: ["product_manager", "finance_manager", "legal_compliance_agent"],
    informed: ["chief_of_staff", "engineering_director"]
  },
  {
    phase: "discovery",
    responsible: ["lead_ba", "business_analyst", "ux_researcher"],
    accountable: "product_manager",
    consulted: ["qa_lead", "solution_architect"],
    informed: ["cpo"]
  },
  {
    phase: "planning",
    responsible: ["product_manager", "project_manager", "tech_lead"],
    accountable: "cpo",
    consulted: ["lead_ba", "qa_lead", "coo"],
    informed: ["ceo"]
  },
  {
    phase: "design",
    responsible: ["product_designer", "ui_designer", "ux_writer"],
    accountable: "cpo",
    consulted: ["frontend_developer", "accessibility_qa", "design_system_designer"],
    informed: ["product_manager"]
  },
  {
    phase: "architecture",
    responsible: ["solution_architect", "tech_lead"],
    accountable: "cto",
    consulted: ["backend_developer", "frontend_developer", "database_engineer", "devops_lead", "security_engineer"],
    informed: ["engineering_director"]
  },
  {
    phase: "implementation",
    responsible: ["frontend_developer", "backend_developer", "fullstack_developer", "database_engineer", "ai_ml_engineer", "integration_engineer"],
    accountable: "tech_lead",
    consulted: ["automation_qa", "security_engineer"],
    informed: ["product_manager"]
  },
  {
    phase: "qa",
    responsible: ["qa_lead", "manual_qa", "automation_qa"],
    accountable: "qa_lead",
    consulted: ["tech_lead", "business_analyst", "product_designer", "security_qa", "performance_qa", "accessibility_qa"],
    informed: ["product_manager", "cto"]
  },
  {
    phase: "fix_loop",
    responsible: ["tech_lead", "frontend_developer", "backend_developer", "automation_qa"],
    accountable: "tech_lead",
    consulted: ["qa_lead", "product_manager"],
    informed: ["cto"]
  },
  {
    phase: "release",
    responsible: ["devops_lead", "release_manager"],
    accountable: "coo",
    consulted: ["sre", "security_engineer", "qa_lead"],
    informed: ["ceo", "product_manager"]
  },
  {
    phase: "monitoring",
    responsible: ["sre"],
    accountable: "devops_lead",
    consulted: ["release_manager", "customer_success_agent"],
    informed: ["coo"]
  },
  {
    phase: "final_report",
    responsible: ["technical_writer", "chief_of_staff"],
    accountable: "ceo",
    consulted: ["product_manager", "tech_lead", "qa_lead", "devops_lead"],
    informed: ["customer_success_agent", "knowledge_manager"]
  }
] as const satisfies readonly RaciAssignment[];

export const PHASE_RACI_BY_PHASE = Object.fromEntries(
  PHASE_RACI.map((assignment) => [assignment.phase, assignment])
) as unknown as Record<OperationalMissionPhase, RaciAssignment>;

export function getRaciForPhase(phase: OperationalMissionPhase): RaciAssignment {
  return PHASE_RACI_BY_PHASE[phase];
}
