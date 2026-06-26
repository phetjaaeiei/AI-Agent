import { Cpu } from "lucide-react";
import type { AgentRuntimeInfo } from "../../../../../packages/shared/src/index.js";
import type { RuntimeArtifactContent } from "../../../../../packages/workflow/src/index.js";
import { artifactSourceLabel } from "../../utils/artifact-content.js";

export type OllamaLearningCandidate = {
  id: string;
  title: string;
  source: RuntimeArtifactContent["source"];
  status: RuntimeArtifactContent["status"];
  readiness: "ready" | "needs_review" | "queued";
  summary: string;
};

export function OllamaLearningCard({
  candidates,
  runtimeInfo
}: {
  candidates: readonly OllamaLearningCandidate[];
  runtimeInfo: AgentRuntimeInfo;
}) {
  const readyCount = candidates.filter((candidate) => candidate.readiness === "ready").length;

  return (
    <section className="ollama-learning-card" aria-label="Ollama automatic learning queue">
      <div className="learning-heading">
        <div className="section-title">
          <Cpu size={16} />
          <h3>Ollama Auto Learning</h3>
        </div>
        <span>{readyCount}/{candidates.length} ready</span>
      </div>
      <div className="learning-policy-row">
        <span>{runtimeInfo.activeProvider === "ollama" ? "Ollama capture" : "Fallback capture"}</span>
        <strong>{runtimeInfo.model}</strong>
      </div>
      <div className="learning-policy-facts">
        <span>Auto capture on</span>
        <span>Local only</span>
        <span>Fine-tune policy pending</span>
      </div>
      {candidates.length > 0 ? (
        <div className="learning-candidate-list">
          {candidates.slice(0, 4).map((candidate) => (
            <article className={`learning-candidate status-${candidate.readiness}`} key={candidate.id}>
              <span>{artifactSourceLabel(candidate.source)}</span>
              <strong>{candidate.title}</strong>
              <em>{candidate.readiness.replace("_", " ")}</em>
              <p>{candidate.summary}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="learning-empty">No real evidence candidates captured yet.</p>
      )}
    </section>
  );
}
