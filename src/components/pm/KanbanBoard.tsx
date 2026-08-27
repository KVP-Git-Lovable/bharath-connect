import { useState, useRef } from "react";
import { Task, TaskStatus, Sprint, Milestone, Section, useUpdateTask, useDeleteTask, useCreateTask, useCreateSection, useDeleteSection, useUpdateSection } from "@/hooks/useProjects";
import { CreateTaskModal } from "./CreateTaskModal";
import { PriorityBadge } from "./TaskStatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MoreVertical, Trash2, Calendar, Clock, Filter, Group, X, Pencil } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type GroupBy = "section" | "status" | "priority" | "assignee";

interface Props {
  tasks: Task[];
  onUpdateTask: (id: string, status: TaskStatus) => void;
  onAddTask: (status: TaskStatus) => void;
  projectId: string;
  sprints: Sprint[];
  milestones: Milestone[];
  sections: Section[];
  onTaskClick?: (task: Task) => void;
}

export function KanbanBoard({ tasks, onUpdateTask, projectId, sprints, milestones, sections, onTaskClick }: Props) {
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const createSection = useCreateSection();
  const deleteSection = useDeleteSection();
  const updateSection = useUpdateSection();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [createFor, setCreateFor] = useState<{ sectionId?: string; status?: TaskStatus } | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("section");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const addSectionRef = useRef<HTMLInputElement>(null);

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    if (!t.parent_task_id) {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    }
    return !t.parent_task_id; // Only root tasks in board
  });

  // Build columns based on groupBy
  const columns = buildColumns(filteredTasks, groupBy, sections);

  const handleDragStart = (taskId: string) => setDragging(taskId);
  const handleDragEnd = () => { setDragging(null); setDragOver(null); };
  const handleDragOver = (e: React.DragEvent, colId: string) => { e.preventDefault(); setDragOver(colId); };
  const handleDrop = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (!dragging) return;
    if (groupBy === "section") {
      const sectionId = colId === "__unsectioned" ? null : colId;
      updateTask.mutate({ id: dragging, section_id: sectionId } as any);
    } else if (groupBy === "status") {
      onUpdateTask(dragging, colId as TaskStatus);
    } else if (groupBy === "priority") {
      updateTask.mutate({ id: dragging, priority: colId } as any);
    }
    setDragging(null);
    setDragOver(null);
  };

  const handleAddSection = async () => {
    if (!newSectionName.trim()) {
      setShowAddSection(false);
      return;
    }
    await createSection.mutateAsync({
      project_id: projectId,
      name: newSectionName.trim(),
      position: sections.length,
    });
    setNewSectionName("");
    setShowAddSection(false);
  };

  const hasActiveFilters = filterStatus !== "all" || filterPriority !== "all";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card flex-shrink-0">
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-3.5 h-3.5" />
          Filter
          {hasActiveFilters && <Badge variant="default" className="h-4 w-4 p-0 text-[10px] flex items-center justify-center rounded-full">!</Badge>}
        </Button>
        <div className="flex items-center gap-1.5">
          <Group className="w-3.5 h-3.5 text-muted-foreground" />
          <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="section">Section</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="assignee">Assignee</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 flex-shrink-0">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="backlog">Backlog</SelectItem>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => { setFilterStatus("all"); setFilterPriority("all"); }}>
              <X className="w-3 h-3" /> Clear
            </Button>
          )}
        </div>
      )}

      {/* Board */}
      <div className="flex gap-3 p-4 flex-1 overflow-x-auto">
        {columns.map(col => (
          <div
            key={col.id}
            className={cn("flex-shrink-0 w-72 flex flex-col rounded-xl border bg-card", dragOver === col.id ? "ring-2 ring-primary" : "")}
            onDragOver={e => handleDragOver(e, col.id)}
            onDrop={e => handleDrop(e, col.id)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between px-3 py-2.5 rounded-t-xl border-b bg-muted/40">
              <div className="flex items-center gap-2">
                {editingSectionId === col.id ? (
                  <input
                    autoFocus
                    value={editingSectionName}
                    onChange={e => setEditingSectionName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        if (editingSectionName.trim()) {
                          updateSection.mutate({ id: col.id, projectId, name: editingSectionName.trim() });
                        }
                        setEditingSectionId(null);
                      }
                      if (e.key === "Escape") setEditingSectionId(null);
                    }}
                    onBlur={() => {
                      if (editingSectionName.trim() && editingSectionName.trim() !== col.label) {
                        updateSection.mutate({ id: col.id, projectId, name: editingSectionName.trim() });
                      }
                      setEditingSectionId(null);
                    }}
                    className="text-sm font-semibold bg-transparent border-none outline-none text-foreground w-full"
                  />
                ) : (
                  <span className="text-sm font-semibold text-foreground">{col.label}</span>
                )}
                <Badge variant="secondary" className="text-xs h-5 min-w-5 px-1.5">{col.tasks.length}</Badge>
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    if (groupBy === "section") {
                      setCreateFor({ sectionId: col.id === "__unsectioned" ? undefined : col.id });
                    } else if (groupBy === "status") {
                      setCreateFor({ status: col.id as TaskStatus });
                    } else {
                      setCreateFor({});
                    }
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
                {groupBy === "section" && col.id !== "__unsectioned" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <MoreVertical className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingSectionId(col.id);
                          setEditingSectionName(col.label);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Rename section
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteSection.mutate({ id: col.id, projectId })}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete section
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Tasks */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
              {col.tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  dragging={dragging}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onUpdateTask={onUpdateTask}
                  onDelete={() => deleteTask.mutate({ id: task.id, projectId: task.project_id })}
                  onClick={() => onTaskClick?.(task)}
                />
              ))}
            </div>

            {/* Add task footer */}
            <div className="p-2 border-t">
              <button
                onClick={() => {
                  if (groupBy === "section") {
                    setCreateFor({ sectionId: col.id === "__unsectioned" ? undefined : col.id });
                  } else if (groupBy === "status") {
                    setCreateFor({ status: col.id as TaskStatus });
                  } else {
                    setCreateFor({});
                  }
                }}
                className="w-full text-left text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add task
              </button>
            </div>
          </div>
        ))}

        {/* Add section column (only when grouped by section) */}
        {groupBy === "section" && (
          <div className="flex-shrink-0 w-72">
            {showAddSection ? (
              <div className="border rounded-xl p-3 bg-card">
                <input
                  ref={addSectionRef}
                  autoFocus
                  value={newSectionName}
                  onChange={e => setNewSectionName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleAddSection();
                    if (e.key === "Escape") { setShowAddSection(false); setNewSectionName(""); }
                  }}
                  onBlur={handleAddSection}
                  placeholder="Section name..."
                  className="w-full text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 font-semibold"
                />
              </div>
            ) : (
              <button
                onClick={() => { setShowAddSection(true); setTimeout(() => addSectionRef.current?.focus(), 50); }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-3 py-2.5 rounded-xl border border-dashed hover:border-primary/50 transition-colors w-full"
              >
                <Plus className="w-4 h-4" /> Add section
              </button>
            )}
          </div>
        )}
      </div>

      {createFor !== null && (
        <CreateTaskModal
          open={true}
          onClose={() => setCreateFor(null)}
          projectId={projectId}
          sprints={sprints}
          milestones={milestones}
          sections={sections}
          defaultStatus={createFor?.status}
          defaultSectionId={createFor?.sectionId}
        />
      )}
    </div>
  );
}

// ── Task Card ──────────────────────────────────────────────────────

function TaskCard({ task, dragging, onDragStart, onDragEnd, onUpdateTask, onDelete, onClick }: {
  task: Task;
  dragging: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onUpdateTask: (id: string, status: TaskStatus) => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  const STATUS_OPTIONS: { status: TaskStatus; label: string }[] = [
    { status: "backlog", label: "Backlog" },
    { status: "todo", label: "To Do" },
    { status: "in_progress", label: "In Progress" },
    { status: "in_review", label: "In Review" },
    { status: "done", label: "Done" },
  ];

  return (
    <div
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "bg-card border rounded-lg p-3 cursor-pointer active:cursor-grabbing shadow-sm hover:shadow-md hover:border-primary/30 transition-all group",
        dragging === task.id ? "opacity-40 scale-95" : ""
      )}
    >
      <div className="flex items-start justify-between gap-1 mb-2">
        <div className="flex items-center gap-1 flex-wrap">
          {task.type === "bug" && <span className="text-xs">🐛</span>}
          {task.type === "idea" && <span className="text-xs">💡</span>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0">
              <MoreVertical className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STATUS_OPTIONS.filter(c => c.status !== task.status).map(c => (
              <DropdownMenuItem key={c.status} onClick={() => onUpdateTask(task.id, c.status)}>
                Move to {c.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm font-medium text-foreground leading-tight mb-2">{task.title}</p>

      {/* Status + Priority row */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-medium",
          task.status === "done" ? "bg-green-500/10 text-green-600" :
          task.status === "in_progress" ? "bg-blue-500/10 text-blue-600" :
          task.status === "in_review" ? "bg-purple-500/10 text-purple-600" :
          task.status === "todo" ? "bg-amber-500/10 text-amber-600" :
          "bg-muted text-muted-foreground"
        )}>
          {task.status.replace(/_/g, ' ')}
        </span>
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {task.due_date && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {format(new Date(task.due_date), "MMM d")}
          </span>
        )}
        {task.estimated_hours && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {task.estimated_hours}h
          </span>
        )}
      </div>

      {/* Task Owner only (no collaborators on card) */}
      {task.assignee && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
              {task.assignee.full_name?.charAt(0) ?? "?"}
            </div>
            <span className="text-xs text-muted-foreground truncate">{task.assignee.full_name}</span>
          </div>
        </div>
      )}

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.slice(0, 2).map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded">{tag}</span>
          ))}
          {task.tags.length > 2 && <span className="text-xs text-muted-foreground">+{task.tags.length - 2}</span>}
        </div>
      )}
    </div>
  );
}

// ── Build columns helper ──────────────────────────────────────────

function buildColumns(tasks: Task[], groupBy: GroupBy, sections: Section[]): { id: string; label: string; tasks: Task[] }[] {
  switch (groupBy) {
    case "section": {
      const cols = sections.map(s => ({
        id: s.id,
        label: s.name,
        tasks: tasks.filter(t => t.section_id === s.id),
      }));
      const unsectioned = tasks.filter(t => !t.section_id);
      if (unsectioned.length > 0 || sections.length === 0) {
        cols.unshift({ id: "__unsectioned", label: "No section", tasks: unsectioned });
      }
      return cols;
    }
    case "status": {
      const statuses: { id: TaskStatus; label: string }[] = [
        { id: "backlog", label: "Backlog" },
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "in_review", label: "In Review" },
        { id: "done", label: "Done" },
      ];
      return statuses.map(s => ({ id: s.id, label: s.label, tasks: tasks.filter(t => t.status === s.id) }));
    }
    case "priority": {
      const priorities = [
        { id: "critical", label: "🔴 Critical" },
        { id: "high", label: "🟠 High" },
        { id: "medium", label: "🟡 Medium" },
        { id: "low", label: "🟢 Low" },
      ];
      return priorities.map(p => ({ id: p.id, label: p.label, tasks: tasks.filter(t => t.priority === p.id) }));
    }
    case "assignee": {
      const assigneeMap = new Map<string, { name: string; tasks: Task[] }>();
      const unassigned: Task[] = [];
      tasks.forEach(t => {
        if (t.assignee) {
          const key = t.assignee_id || t.assignee.full_name;
          if (!assigneeMap.has(key)) assigneeMap.set(key, { name: t.assignee.full_name, tasks: [] });
          assigneeMap.get(key)!.tasks.push(t);
        } else {
          unassigned.push(t);
        }
      });
      const cols = Array.from(assigneeMap.entries()).map(([id, { name, tasks }]) => ({
        id, label: name, tasks,
      }));
      if (unassigned.length > 0) {
        cols.unshift({ id: "__unassigned", label: "Unassigned", tasks: unassigned });
      }
      return cols;
    }
    default:
      return [];
  }
}
