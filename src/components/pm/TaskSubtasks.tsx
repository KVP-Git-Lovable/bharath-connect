import { useState, useRef, useEffect } from "react";
import { Task, useCreateTask, useTaskCollaborators, useAddTaskCollaborator, useUpdateTask } from "@/hooks/useProjects";
import { StatusBadge, PriorityBadge } from "./TaskStatusBadge";
import { Plus, Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  task: Task;
  allTasks: Task[];
  projectId: string;
  onSelectTask: (task: Task) => void;
}

// Small inline user avatar
function MiniUserAvatar({ userId }: { userId: string | null }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("full_name").eq("id", userId).single().then(({ data }) => {
      setName(data?.full_name || null);
    });
  }, [userId]);
  if (!userId || !name) return <span className="text-[10px] text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1" title={name}>
      <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[8px] font-semibold flex-shrink-0">
        {name.charAt(0)}
      </div>
      <span className="text-[11px] text-muted-foreground truncate max-w-[60px]">{name}</span>
    </div>
  );
}

// Inline due date for subtask row
function SubtaskDueDate({ subtask }: { subtask: Task }) {
  const updateTask = useUpdateTask();
  const [open, setOpen] = useState(false);
  const dateObj = subtask.due_date ? new Date(subtask.due_date + "T00:00:00") : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={e => e.stopPropagation()}
          className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
        >
          <Calendar className="w-3 h-3" />
          {subtask.due_date ? format(new Date(subtask.due_date), "MMM d") : "No date"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom" onClick={e => e.stopPropagation()}>
        <CalendarComponent
          mode="single"
          selected={dateObj}
          onSelect={(d) => {
            if (d) updateTask.mutate({ id: subtask.id, due_date: format(d, "yyyy-MM-dd") });
            setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

export function TaskSubtasks({ task, allTasks, projectId, onSelectTask }: Props) {
  const createTask = useCreateTask();
  const { data: collaborators = [] } = useTaskCollaborators(task.id);
  const addCollaborator = useAddTaskCollaborator();
  const [inlineTitle, setInlineTitle] = useState("");
  const [showInline, setShowInline] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const subtasks = allTasks.filter(t => t.parent_task_id === task.id);

  // Show parent task link if this task IS a subtask
  const parentTask = task.parent_task_id ? allTasks.find(t => t.id === task.parent_task_id) : null;

  // Auto-add subtask owners as collaborators on the parent task
  useEffect(() => {
    if (!subtasks.length) return;
    const parentOwnerId = task.assignee_id;
    const collabUserIds = new Set(collaborators.map(c => c.user_id));

    subtasks.forEach(sub => {
      if (sub.assignee_id && sub.assignee_id !== parentOwnerId && !collabUserIds.has(sub.assignee_id)) {
        addCollaborator.mutate({ taskId: task.id, userId: sub.assignee_id });
        collabUserIds.add(sub.assignee_id);
      }
    });
  }, [subtasks.map(s => s.assignee_id).join(','), collaborators.length]);

  const handleSubmit = async () => {
    if (!inlineTitle.trim()) {
      setShowInline(false);
      setInlineTitle("");
      return;
    }
    await createTask.mutateAsync({
      project_id: projectId,
      parent_task_id: task.id,
      title: inlineTitle.trim(),
      type: "task",
      status: "backlog",
      priority: "medium",
    });
    setInlineTitle("");
  };

  const startAdd = () => {
    setShowInline(true);
    setInlineTitle("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="space-y-2">
      <div className="space-y-0 border rounded-lg overflow-hidden">
        {subtasks.map(sub => (
          <div
            key={sub.id}
            onClick={() => onSelectTask(sub)}
            className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
          >
            <span className="text-sm flex-1 truncate">{sub.title}</span>
            <MiniUserAvatar userId={sub.assignee_id} />
            <SubtaskDueDate subtask={sub} />
            <StatusBadge status={sub.status} />
            <PriorityBadge priority={sub.priority} />
          </div>
        ))}

        {/* Inline add row */}
        {showInline ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/10 border-b last:border-b-0">
            <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              autoFocus
              value={inlineTitle}
              onChange={e => setInlineTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") { setShowInline(false); setInlineTitle(""); }
              }}
              onBlur={() => handleSubmit()}
              placeholder="Type sub-task name, press Enter..."
              className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        ) : (
          <button
            onClick={startAdd}
            className="w-full text-left text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/20"
          >
            <Plus className="w-3.5 h-3.5" /> Add sub-task...
          </button>
        )}
      </div>
    </div>
  );
}
