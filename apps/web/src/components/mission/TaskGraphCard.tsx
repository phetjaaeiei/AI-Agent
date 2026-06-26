import { Boxes } from "lucide-react";
import type { RoleId } from "../../../../../packages/shared/src/index.js";
import { getShortRoleName } from "../../utils/role-labels.js";

export type TaskRunStatus = "queued" | "running" | "reviewing" | "passed" | "blocked";

type MissionTaskView = {
  id: string;
  title: string;
  ownerRoleId: RoleId;
  initialStatus: TaskRunStatus;
  eta: string;
};

const taskStatusLabel: Record<TaskRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  reviewing: "Reviewing",
  passed: "Passed",
  blocked: "Blocked"
};

export function TaskGraphCard({
  activeTaskId,
  tasks,
  taskRuns,
  onSelectTask
}: {
  activeTaskId: string;
  tasks: readonly MissionTaskView[];
  taskRuns: Readonly<Record<string, TaskRunStatus>>;
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <section className="task-graph-card" aria-label="Mission task graph">
      <div className="section-title">
        <Boxes size={16} />
        <h3>Task Graph</h3>
      </div>
      <div className="task-rows">
        {tasks.map((task) => {
          const status = taskRuns[task.id] ?? task.initialStatus;
          return (
            <button
              aria-pressed={activeTaskId === task.id}
              className={activeTaskId === task.id ? `task-row is-selected status-${status}` : `task-row status-${status}`}
              key={task.id}
              onClick={() => onSelectTask(task.id)}
              type="button"
            >
              <span className="task-row-status">{taskStatusLabel[status]}</span>
              <strong>{task.title}</strong>
              <em>{getShortRoleName(task.ownerRoleId)}</em>
              <span className="task-row-eta">{task.eta}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
