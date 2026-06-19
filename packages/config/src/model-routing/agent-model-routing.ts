import type {
  AgentRoutingMatrix,
  AgentRuntimeKind,
  ModelTier,
  ReasoningEffort,
  RoleId,
  ToolId
} from "../../../shared/src/index.js";

export const MODEL_IDS = {
  frontier: "qwen3:14b",
  professional: "qwen3:8b",
  mini: "qwen3:4b",
  nano: "qwen3:1.7b"
} as const;

const fallbackFor = (tier: ModelTier): string => {
  switch (tier) {
    case "frontier":
      return MODEL_IDS.professional;
    case "professional":
      return MODEL_IDS.mini;
    case "mini":
      return MODEL_IDS.nano;
    case "nano":
      return MODEL_IDS.mini;
    case "specialized":
      return MODEL_IDS.professional;
  }
};

const modelFor = (tier: ModelTier): string => {
  switch (tier) {
    case "frontier":
      return MODEL_IDS.frontier;
    case "professional":
      return MODEL_IDS.professional;
    case "mini":
      return MODEL_IDS.mini;
    case "nano":
      return MODEL_IDS.nano;
    case "specialized":
      return MODEL_IDS.professional;
  }
};

const routing = (
  roleId: RoleId,
  runtimeKind: AgentRuntimeKind,
  modelTier: ModelTier,
  reasoningEffort: ReasoningEffort,
  autonomy: AgentRoutingMatrix[RoleId]["autonomy"],
  maxToolRisk: AgentRoutingMatrix[RoleId]["maxToolRisk"],
  requiredTools: readonly ToolId[],
  forbiddenTools: readonly ToolId[],
  notes: string,
  shouldStream = true
) => ({
  roleId,
  runtimeKind,
  modelTier,
  preferredModel: modelFor(modelTier),
  fallbackModel: fallbackFor(modelTier),
  reasoningEffort,
  autonomy,
  maxToolRisk,
  requiredTools,
  forbiddenTools,
  shouldStream,
  notes
});

const readTools = ["mission_context", "artifact_store", "audit_log"] as const;
const planningTools = [...readTools, "task_graph", "knowledge_base"] as const;
const repoReadTools = [...planningTools, "repo_search", "file_read"] as const;
const codeTools = [...repoReadTools, "file_write", "shell_command", "test_runner"] as const;
const qaTools = [...repoReadTools, "test_runner", "browser_check"] as const;
const deployTools = [...readTools, "ci_status", "git_branch", "git_commit", "pull_request", "deploy_staging", "monitoring"] as const;

export const AGENT_MODEL_ROUTING = {
  ceo: routing("ceo", "executive_reasoning", "frontier", "high", "verifier", "write_remote", planningTools, ["file_write", "shell_command", "deploy_production"], "Use the strongest reasoning tier for mission outcome, conflict resolution, and final accountability."),
  coo: routing("coo", "executive_reasoning", "professional", "high", "verifier", "deploy_staging", planningTools, ["file_write", "shell_command", "deploy_production"], "Operational coordination needs strong reasoning, but usually less depth than CEO/CTO security decisions."),
  cto: routing("cto", "code_architect", "frontier", "xhigh", "verifier", "write_remote", repoReadTools, ["file_write", "deploy_production"], "Architecture and technical risk need frontier reasoning and codebase context."),
  cpo: routing("cpo", "structured_planning", "professional", "high", "verifier", "write_remote", planningTools, ["file_write", "shell_command", "deploy_production"], "Product scope and acceptance criteria need strong structured planning."),
  chief_of_staff: routing("chief_of_staff", "documentation_writer", "professional", "medium", "verifier", "read", planningTools, ["file_write", "shell_command", "deploy_production"], "Status integrity and final narrative need consistency over raw tool power."),
  engineering_director: routing("engineering_director", "structured_planning", "professional", "medium", "drafting", "read", [...planningTools, "role_registry"], ["file_write", "deploy_production"], "Capacity and allocation are planning-heavy with low direct tool risk."),
  product_manager: routing("product_manager", "structured_planning", "professional", "high", "drafting", "read", planningTools, ["file_write", "shell_command"], "PRDs and scope benefit from reliable structured output and moderate-high reasoning."),
  project_manager: routing("project_manager", "fast_support", "mini", "medium", "drafting", "read", planningTools, ["file_write", "deploy_production"], "Timeline and dependency tracking should be fast and inexpensive."),
  scrum_master: routing("scrum_master", "fast_support", "mini", "low", "drafting", "read", planningTools, ["file_write", "deploy_production"], "Blocker tracking and cadence updates are low-risk support work."),
  lead_ba: routing("lead_ba", "business_analysis", "professional", "high", "verifier", "read", planningTools, ["file_write", "shell_command"], "Business rules and acceptance matrix need careful reasoning and verifier behavior."),
  business_analyst: routing("business_analyst", "business_analysis", "professional", "medium", "drafting", "read", planningTools, ["file_write", "shell_command"], "Requirement detail needs consistency and edge-case reasoning."),
  ux_researcher: routing("ux_researcher", "structured_planning", "professional", "medium", "drafting", "read", planningTools, ["file_write", "shell_command"], "User journey assumptions need reasoning but no external tool authority."),
  data_analyst: routing("data_analyst", "operations_analyst", "professional", "medium", "drafting", "read", planningTools, ["file_write", "deploy_production"], "Metrics and event taxonomy need structured analysis."),
  product_designer: routing("product_designer", "design_reasoning", "professional", "high", "drafting", "write_local", [...planningTools, "browser_check"], ["deploy_production"], "Flow and screen behavior need strong UI reasoning and browser review support."),
  ui_designer: routing("ui_designer", "design_reasoning", "professional", "medium", "drafting", "write_local", [...planningTools, "browser_check"], ["deploy_production"], "Visual states need design reasoning, not deployment authority."),
  design_system_designer: routing("design_system_designer", "design_reasoning", "professional", "medium", "verifier", "write_local", [...planningTools, "browser_check"], ["deploy_production"], "Component consistency is a verifier-like design role."),
  ux_writer: routing("ux_writer", "documentation_writer", "mini", "medium", "drafting", "read", planningTools, ["file_write", "deploy_production"], "UX copy is frequent, low-risk, and can use mini unless final report quality requires upgrade."),
  solution_architect: routing("solution_architect", "code_architect", "frontier", "xhigh", "verifier", "write_local", repoReadTools, ["deploy_production"], "System boundaries and integration design need frontier reasoning."),
  tech_lead: routing("tech_lead", "code_architect", "frontier", "high", "verifier", "write_local", codeTools, ["deploy_production"], "Implementation planning and code review need strong coding and reasoning."),
  fullstack_developer: routing("fullstack_developer", "code_builder", "professional", "high", "tool_using", "write_local", codeTools, ["deploy_production"], "Cross-layer implementation needs professional coding with tools."),
  frontend_developer: routing("frontend_developer", "code_builder", "professional", "medium", "tool_using", "write_local", [...codeTools, "browser_check"], ["deploy_production"], "UI implementation needs coding plus browser verification."),
  backend_developer: routing("backend_developer", "code_builder", "professional", "high", "tool_using", "write_local", codeTools, ["deploy_production"], "API/service work needs coding, tests, and schema awareness."),
  database_engineer: routing("database_engineer", "code_architect", "professional", "high", "tool_using", "write_local", codeTools, ["deploy_production"], "Schema and migration work needs careful reasoning and local validation."),
  ai_ml_engineer: routing("ai_ml_engineer", "code_architect", "frontier", "high", "tool_using", "write_local", [...codeTools, "knowledge_base"], ["deploy_production"], "Agent behavior and model routing affect correctness across the whole company."),
  prompt_engineer: routing("prompt_engineer", "structured_planning", "professional", "high", "drafting", "write_local", [...planningTools, "knowledge_base"], ["deploy_production"], "Prompt changes must pair with eval/benchmark thinking."),
  integration_engineer: routing("integration_engineer", "code_builder", "professional", "high", "tool_using", "write_local", codeTools, ["deploy_production"], "External APIs need coding plus careful error/security handling."),
  qa_lead: routing("qa_lead", "qa_verifier", "professional", "high", "verifier", "read", qaTools, ["file_write", "deploy_production"], "QA signoff needs independent verifier behavior."),
  manual_qa: routing("manual_qa", "qa_verifier", "mini", "medium", "verifier", "read", qaTools, ["file_write", "deploy_production"], "Manual path checking should be fast but evidence-focused."),
  automation_qa: routing("automation_qa", "code_builder", "professional", "medium", "tool_using", "write_local", [...qaTools, "file_write", "shell_command"], ["deploy_production"], "Test creation is coding work and can modify local test files."),
  security_qa: routing("security_qa", "security_verifier", "frontier", "xhigh", "verifier", "read", qaTools, ["file_write", "deploy_production"], "Security findings need strongest reasoning and conservative gate behavior."),
  performance_qa: routing("performance_qa", "qa_verifier", "professional", "medium", "verifier", "read", qaTools, ["file_write", "deploy_production"], "Performance diagnosis needs evidence and measurement interpretation."),
  accessibility_qa: routing("accessibility_qa", "qa_verifier", "professional", "medium", "verifier", "read", qaTools, ["file_write", "deploy_production"], "Accessibility signoff needs independent checks and browser evidence."),
  devops_lead: routing("devops_lead", "devops_operator", "professional", "high", "operator", "deploy_staging", deployTools, ["deploy_production"], "CI/CD and staging deploys need operator behavior with policy boundaries."),
  sre: routing("sre", "devops_operator", "professional", "high", "verifier", "deploy_staging", [...deployTools, "monitoring"], ["deploy_production"], "Health and rollback signals need conservative verifier behavior."),
  cloud_architect: routing("cloud_architect", "devops_operator", "frontier", "high", "verifier", "deploy_staging", deployTools, ["deploy_production"], "Cloud topology and infrastructure risk deserve high reasoning."),
  release_manager: routing("release_manager", "devops_operator", "professional", "high", "operator", "deploy_staging", deployTools, ["deploy_production"], "Release readiness coordinates deploy evidence and comms."),
  security_engineer: routing("security_engineer", "security_verifier", "frontier", "xhigh", "verifier", "deploy_staging", [...deployTools, "repo_search", "secret_reference"], ["deploy_production"], "Runtime security can block release and needs strongest reasoning."),
  hr_manager: routing("hr_manager", "operations_analyst", "mini", "low", "drafting", "read", [...readTools, "role_registry"], ["file_write", "shell_command", "deploy_production"], "Capacity planning is low-risk and should be inexpensive."),
  finance_manager: routing("finance_manager", "operations_analyst", "mini", "medium", "verifier", "read", [...readTools, "cost_records"], ["file_write", "shell_command", "deploy_production"], "Cost control needs structured arithmetic and audit evidence."),
  legal_compliance_agent: routing("legal_compliance_agent", "security_verifier", "frontier", "high", "verifier", "read", [...readTools, "knowledge_base"], ["file_write", "shell_command", "deploy_production"], "Compliance risk deserves conservative reasoning and should avoid legal overclaiming."),
  customer_success_agent: routing("customer_success_agent", "documentation_writer", "mini", "medium", "drafting", "read", [...readTools, "knowledge_base"], ["file_write", "deploy_production"], "Customer notes are low tool-risk but need clear wording."),
  technical_writer: routing("technical_writer", "documentation_writer", "professional", "medium", "drafting", "read", [...readTools, "knowledge_base"], ["deploy_production"], "Technical docs need artifact consistency and may upgrade from mini for final reports."),
  knowledge_manager: routing("knowledge_manager", "memory_curator", "professional", "medium", "verifier", "read", [...readTools, "knowledge_base"], ["file_write", "shell_command", "deploy_production"], "Memory must preserve evidence and avoid unverified facts.")
} satisfies AgentRoutingMatrix;

export function getAgentRouting(roleId: RoleId) {
  return AGENT_MODEL_ROUTING[roleId];
}
