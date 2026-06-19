export const DEPARTMENT_IDS = [
  "executive",
  "product",
  "design",
  "engineering",
  "qa",
  "devops",
  "operations"
] as const;

export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export const ROLE_IDS = [
  "ceo",
  "coo",
  "cto",
  "cpo",
  "chief_of_staff",
  "engineering_director",
  "product_manager",
  "project_manager",
  "scrum_master",
  "lead_ba",
  "business_analyst",
  "ux_researcher",
  "data_analyst",
  "product_designer",
  "ui_designer",
  "design_system_designer",
  "ux_writer",
  "solution_architect",
  "tech_lead",
  "fullstack_developer",
  "frontend_developer",
  "backend_developer",
  "database_engineer",
  "ai_ml_engineer",
  "prompt_engineer",
  "integration_engineer",
  "qa_lead",
  "manual_qa",
  "automation_qa",
  "security_qa",
  "performance_qa",
  "accessibility_qa",
  "devops_lead",
  "sre",
  "cloud_architect",
  "release_manager",
  "security_engineer",
  "hr_manager",
  "finance_manager",
  "legal_compliance_agent",
  "customer_success_agent",
  "technical_writer",
  "knowledge_manager"
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export type RoleLevel = "executive" | "lead" | "senior" | "staff" | "specialist";

export type ToolId =
  | "mission_context"
  | "artifact_store"
  | "audit_log"
  | "cost_records"
  | "role_registry"
  | "task_graph"
  | "repo_search"
  | "file_read"
  | "file_write"
  | "shell_command"
  | "test_runner"
  | "browser_check"
  | "git_branch"
  | "git_commit"
  | "pull_request"
  | "ci_status"
  | "deploy_staging"
  | "deploy_production"
  | "monitoring"
  | "issue_tracker"
  | "knowledge_base"
  | "secret_reference";

export type PermissionClass =
  | "read"
  | "draft"
  | "write_local"
  | "write_remote"
  | "deploy_staging"
  | "deploy_production"
  | "external_comms";

export type AgentRoleDefinition = {
  id: RoleId;
  name: string;
  department: DepartmentId;
  level: RoleLevel;
  responsibilities: readonly string[];
  defaultTools: readonly ToolId[];
  permissionClasses: readonly PermissionClass[];
  outputSchemaId: string;
  promptTemplateId: string;
  canCreateTasks: boolean;
  canApprovePhaseGate: boolean;
  canRunExternalTools: boolean;
  mustNotDo: readonly string[];
};

export type DepartmentDefinition = {
  id: DepartmentId;
  name: string;
  purpose: string;
  roomTheme: string;
};
