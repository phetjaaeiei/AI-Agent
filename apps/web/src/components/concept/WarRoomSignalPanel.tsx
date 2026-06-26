import { Activity, Cpu, GitBranch, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type WarRoomSignalTone = "green" | "amber" | "red" | "blue";

export type WarRoomSignal = {
  id: string;
  icon: "activity" | "cpu" | "git" | "shield";
  label: string;
  value: string;
  detail: string;
  tone: WarRoomSignalTone;
};

const signalIcons: Record<WarRoomSignal["icon"], LucideIcon> = {
  activity: Activity,
  cpu: Cpu,
  git: GitBranch,
  shield: ShieldCheck
};

export function WarRoomSignalPanel({
  headline,
  signals,
  subline
}: {
  headline: string;
  signals: readonly WarRoomSignal[];
  subline: string;
}) {
  return (
    <section className="war-room-signal-panel" aria-label="Pixel war room mission signals">
      <div className="signal-panel-copy">
        <span>Pixel War Room</span>
        <h2>{headline}</h2>
        <p>{subline}</p>
      </div>
      <div className="signal-grid">
        {signals.map((signal) => {
          const Icon = signalIcons[signal.icon];

          return (
            <article className={`signal-tile tone-${signal.tone}`} key={signal.id}>
              <div className="signal-pixel" aria-hidden="true">
                <Icon size={16} />
              </div>
              <div>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
                <p>{signal.detail}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
