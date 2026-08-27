import { useState } from "react";
import { Task, useTaskDependencies, useCreateTaskDependency, useDeleteTaskDependency } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, Plus, Trash2, X } from "lucide-react";

interface Props {
  task: Task;
  allTasks: Task[];
  onSelectTask: (task: Task) => void;
}

export function TaskDependencies({ task, allTasks, onSelectTask }: Props) {
  const { data: dependencies = [] } = useTaskDependencies(task.id);
  const createDep = useCreateTaskDependency();
  const deleteDep = useDeleteTaskDependency();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [depType, setDepType] = useState("blocked_by");

  const otherTasks = allTasks.filter(t => t.id !== task.id);

  const handleAdd = () => {
    if (!selectedTaskId) return;
    createDep.mutate({
      task_id: task.id,
      depends_on_task_id: selectedTaskId,
      dependency_type: depType,
    });
    setSelectedTaskId("");
    setShowAdd(false);
  };

  const depTypeLabels: Record<string, string> = {
    blocked_by: "Blocked by",
    blocks: "Blocks",
    related: "Related to",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Dependencies</h3>
        <span className="text-xs text-muted-foreground">{dependencies.length}</span>
      </div>

      {/* Existing dependencies */}
      <div className="space-y-1.5">
        {dependencies.map((dep: any) => {
          const linkedTask = allTasks.find(t => t.id === dep.depends_on_task_id);
          return (
            <div key={dep.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/20 group">
              <Link className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs px-1.5 py-0.5 bg-secondary rounded text-secondary-foreground flex-shrink-0">
                {depTypeLabels[dep.dependency_type] || dep.dependency_type}
              </span>
              <span
                className="text-sm flex-1 truncate cursor-pointer hover:text-primary transition-colors"
                onClick={() => linkedTask && onSelectTask(linkedTask)}
              >
                {linkedTask?.title || "Unknown task"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
                onClick={() => deleteDep.mutate({ id: dep.id, taskId: task.id })}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Add dependency */}
      {showAdd ? (
        <div className="p-2 border rounded-md space-y-2 bg-muted/10">
          <div className="flex items-center gap-2">
            <Select value={depType} onValueChange={setDepType}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blocked_by">Blocked by</SelectItem>
                <SelectItem value="blocks">Blocks</SelectItem>
                <SelectItem value="related">Related to</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => setShowAdd(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select a task..." />
            </SelectTrigger>
            <SelectContent>
              {otherTasks.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="truncate">{t.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!selectedTaskId} className="w-full">
            Add Dependency
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full text-left text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 px-3 py-2 border border-dashed rounded-md transition-colors hover:bg-muted/20"
        >
          <Plus className="w-3.5 h-3.5" /> Add dependency...
        </button>
      )}
    </div>
  );
}
