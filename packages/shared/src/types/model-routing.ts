import type { RoleId, ToolId } from "./roles.js";

export type ModelTier =
  | "frontier"
  | "professional"
  | "mini"
  | "nano"
  | "specialized";

export type AgentRuntimeKind =
  | "executive_reasoning"
  | "structured_planning"
  | "business_analysis"
  | "design_reasoning"
  | "code_architect"
  | "code_builder"
  | "qa_verifier"
  | "security_verifier"
  | "devops_operator"
  | "operations_analyst"
  | "documentation_writer"
  | "memory_curator"
  | "fast_support";

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export type AgentRoutingProfile = {
  roleId: RoleId;
  runtimeKind: AgentRuntimeKind;
  modelTier: ModelTier;
  preferredModel: string;
  fallbackModel: string;
  reasoningEffort: ReasoningEffort;
  autonomy: "advisory" | "drafting" | "tool_using" | "verifier" | "operator";
  maxToolRisk: "read" | "write_local" | "write_remote" | "deploy_staging" | "deploy_production";
  requiredTools: readonly ToolId[];
  forbiddenTools: readonly ToolId[];
  shouldStream: boolean;
  notes: string;
};

export type AgentRoutingMatrix = Record<RoleId, AgentRoutingProfile>;
