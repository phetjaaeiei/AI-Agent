import type { QualityGateDefinition, QualityGateId } from "../../../shared/src/index.js";

export const QUALITY_GATES = [
  {
    id: "planning_gate",
    name: "Planning Gate",
    phase: "planning",
    minimumScore: 80,
    requiredArtifacts: ["mission_charter", "prd", "user_story", "assumption_log", "risk_register"],
    verifierRoleIds: ["cpo", "lead_ba", "qa_lead"],
    passCriteria: [
      "No critical ambiguity remains open",
      "Acceptance criteria are measurable",
      "Scope in and scope out do not contradict each other",
      "Risks are assigned to owners"
    ]
  },
  {
    id: "technical_design_gate",
    name: "Technical Design Gate",
    phase: "architecture",
    minimumScore: 82,
    requiredArtifacts: ["technical_design", "test_plan", "risk_register"],
    verifierRoleIds: ["cto", "solution_architect", "tech_lead", "security_engineer"],
    passCriteria: [
      "Module boundaries are clear",
      "Known dependencies are named",
      "Rollback path exists for risky changes",
      "Test strategy maps to implementation"
    ]
  },
  {
    id: "implementation_gate",
    name: "Implementation Gate",
    phase: "implementation",
    minimumScore: 85,
    requiredArtifacts: ["code_patch", "test_result"],
    verifierRoleIds: ["tech_lead", "automation_qa"],
    passCriteria: [
      "Code compiles or build failure is documented",
      "Tests pass or failures have defect records",
      "No unrelated changes are included",
      "Implementation maps to acceptance criteria"
    ]
  },
  {
    id: "qa_gate",
    name: "QA Gate",
    phase: "qa",
    minimumScore: 88,
    requiredArtifacts: ["test_plan", "test_result", "qa_report"],
    verifierRoleIds: ["qa_lead", "product_manager", "tech_lead"],
    passCriteria: [
      "Critical and high defects are closed",
      "Regression risk is documented",
      "Manual and automation results agree or conflict is resolved",
      "Accessibility, security, and performance checks are included when relevant"
    ]
  },
  {
    id: "release_gate",
    name: "Release Gate",
    phase: "release",
    minimumScore: 90,
    requiredArtifacts: ["deployment_log", "release_note"],
    verifierRoleIds: ["devops_lead", "sre", "release_manager", "security_engineer"],
    passCriteria: [
      "Deployment target is correct",
      "Rollback path is ready",
      "Smoke test can verify core behavior",
      "No blocking security finding remains open"
    ]
  },
  {
    id: "final_report_gate",
    name: "Final Report Gate",
    phase: "final_report",
    minimumScore: 85,
    requiredArtifacts: ["final_report", "release_note", "qa_report"],
    verifierRoleIds: ["chief_of_staff", "ceo", "technical_writer"],
    passCriteria: [
      "Report matches actual artifacts and audit events",
      "Assumptions and known limitations are visible",
      "Test and deployment results are linked",
      "Next actions are specific"
    ]
  }
] as const satisfies readonly QualityGateDefinition[];

export const QUALITY_GATE_BY_ID = Object.fromEntries(
  QUALITY_GATES.map((gate) => [gate.id, gate])
) as unknown as Record<QualityGateId, QualityGateDefinition>;

export function getQualityGate(gateId: QualityGateId): QualityGateDefinition {
  return QUALITY_GATE_BY_ID[gateId];
}
