import { cn } from "@/lib/utils";
import { TaskStatus, TaskType, Priority } from "@/hooks/useProjects";

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  backlog:     { label: "Backlog",     className: "bg-muted text-muted-foreground" },
  todo:        { label: "To Do",       className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_progress: { label: "In Progress", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  in_review:   { label: "In Review",   className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  done:        { label: "Done",        className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  cancelled:   { label: "Cancelled",   className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  overdue:     { label: "Overdue",     className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const priorityConfig: Record<Priority, { label: string; className: string; dot: string }> = {
  critical: { label: "Critical", className: "text-red-600 dark:text-red-400",    dot: "bg-red-500" },
  high:     { label: "High",     className: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  medium:   { label: "Medium",   className: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  low:      { label: "Low",      className: "text-green-600 dark:text-green-400", dot: "bg-green-500" },
};

const typeConfig: Record<TaskType, { label: string; emoji: string; className: string }> = {
  task:      { label: "Task",      emoji: "✅", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  bug:       { label: "Bug",       emoji: "🐛", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  idea:      { label: "Idea",      emoji: "💡", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  milestone: { label: "Milestone", emoji: "🏁", className: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.todo;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = priorityConfig[priority] ?? priorityConfig.medium;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", cfg.className)}>
      <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function TypeBadge({ type }: { type: TaskType }) {
  const cfg = typeConfig[type] ?? typeConfig.task;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium", cfg.className)}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}
