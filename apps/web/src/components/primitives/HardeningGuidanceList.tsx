import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type HardeningGuidance = {
  id: string;
  tone: "info" | "warning" | "danger" | "success";
  title: string;
  detail: string;
  action: string;
};

export function HardeningGuidanceList({ guidance }: { guidance: readonly HardeningGuidance[] }) {
  if (guidance.length === 0) return null;

  return (
    <div className="hardening-guidance-list" aria-label="Hardening guidance">
      {guidance.map((item) => {
        const Icon: LucideIcon = item.tone === "success" ? CheckCircle2 : item.tone === "info" ? ShieldCheck : AlertTriangle;

        return (
          <article className={`hardening-guidance tone-${item.tone}`} key={item.id}>
            <Icon size={13} />
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <span>{item.action}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
