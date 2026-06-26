import type { RuntimeArtifactContent } from "../../../../packages/workflow/src/index.js";

const seededArtifactContentIds = new Set([
  "artifact-content-art-prd-v1",
  "artifact-content-art-acceptance-v2",
  "artifact-content-art-technical-plan-v3",
  "artifact-content-art-qa-report-v4",
  "artifact-content-art-deploy-log-v5"
]);

export function artifactSourceLabel(source: RuntimeArtifactContent["source"]): string {
  if (source === "orchestrator") return "Server";
  if (source === "agent_runtime") return "Agent";
  if (source === "tool_runner") return "Tool";
  if (source === "git_runner") return "Git";
  if (source === "review_service") return "Review";
  return "Local";
}

export function isSeededArtifactContent(content: RuntimeArtifactContent): boolean {
  return content.source === "orchestrator" && seededArtifactContentIds.has(content.id);
}

export function isRealArtifactContent(content: RuntimeArtifactContent): boolean {
  return !isSeededArtifactContent(content);
}
