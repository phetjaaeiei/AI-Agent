import {
  Bot,
  Boxes,
  Command,
  FileText,
  GitBranch,
  LayoutDashboard,
  TestTube2,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function LeftNav() {
  const items: { label: string; icon: LucideIcon; active?: boolean }[] = [
    { label: "HQ", icon: LayoutDashboard, active: true },
    { label: "Missions", icon: Command },
    { label: "Company", icon: UsersRound },
    { label: "Artifacts", icon: FileText },
    { label: "QA Lab", icon: TestTube2 },
    { label: "Deployments", icon: GitBranch },
    { label: "Settings", icon: Boxes }
  ];

  return (
    <aside className="left-nav" aria-label="Primary navigation">
      <div className="brand-mark" aria-label="Team AI Agent">
        <Bot size={22} />
      </div>
      <nav>
        {items.map((item) => (
          <button className={item.active ? "nav-item is-active" : "nav-item"} key={item.label} type="button">
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
