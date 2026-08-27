import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  useProject, useTasks, useSprints, useMilestones, useRisks, useSections,
  useUpdateTask, Task
} from "@/hooks/useProjects";
import { CreateTaskModal } from "@/components/pm/CreateTaskModal";
// import { GanttChart } from "@/components/pm/GanttChart"; // TODO: Phase 5
// import { CalendarView } from "@/components/pm/CalendarView"; // TODO: Phase 5
import { KanbanBoard } from "@/components/pm/KanbanBoard";
// import { BacklogView } from "@/components/pm/BacklogView"; // TODO: Phase 5
// import { RisksPanel } from "@/components/pm/RisksPanel"; // TODO: Phase 5
// import { MilestonesPanel } from "@/components/pm/MilestonesPanel"; // TODO: Phase 5
// import { SprintsPanel } from "@/components/pm/SprintsPanel"; // TODO: Phase 5
// import { ProjectOverview } from "@/components/pm/ProjectOverview"; // TODO: Phase 5
import { TaskDetailPanel } from "@/components/pm/TaskDetailPanel";
import { TaskTimesheetSection } from "@/components/pm/TaskTimesheetSection";
// import { ResourcesPanel } from "@/components/pm/ResourcesPanel"; // TODO: Phase 5
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Plus, Kanban, List, BarChart3,
  AlertTriangle, Layers, Grid, Calendar, Clock, Users,
  ChevronDown, MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: loadingProject } = useProject(id!);
  const { data: tasks = [] } = useTasks(id!);
  const { data: sprints = [] } = useSprints(id!);
  const { data: milestones = [] } = useMilestones(id!);
  const { data: risks = [] } = useRisks(id!);
  const { data: sections = [] } = useSections(id!);
  const updateTask = useUpdateTask();
  const [tab, setTab] = useState("board");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isFullView, setIsFullView] = useState(false);

  const taskStats = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    done: tasks.filter(t => t.status === "done").length,
    backlog: tasks.filter(t => t.status === "backlog").length,
  }), [tasks]);

  const progress = taskStats.total > 0
    ? Math.round((taskStats.done / taskStats.total) * 100)
    : 0;

  // Keep selected task in sync with latest data
  const currentSelectedTask = useMemo(() => {
    if (!selectedTask) return null;
    return tasks.find(t => t.id === selectedTask.id) || null;
  }, [selectedTask, tasks]);

  if (loadingProject) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded w-48" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="outline" onClick={() => navigate("/projects")} className="mt-4">Back to Projects</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Project Header */}
      <div className="border-b bg-card px-6 py-4 flex-shrink-0">
        <button
          onClick={() => navigate("/projects")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> All Projects
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">{project.name}</h1>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{project.description}</p>
              )}
            </div>
          </div>
          {tab !== "sprints" && (
            <Button onClick={() => setShowCreateTask(true)} size="sm" className="gap-2 flex-shrink-0">
              <Plus className="w-4 h-4" /> Add Task
            </Button>
          )}
        </div>

        {/* Mini stats */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{taskStats.total} tasks</span>
            <span className="text-amber-600">{taskStats.in_progress} in progress</span>
            <span className="text-green-600">{taskStats.done} done</span>
            {risks.filter(r => r.status === "open").length > 0 && (
              <span className="text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {risks.filter(r => r.status === "open").length} risks
              </span>
            )}
          </div>
          <div className="flex-1 max-w-48">
            <Progress value={progress} className="h-1.5" />
          </div>
          <span className="text-xs text-muted-foreground">{progress}%</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={tab} onValueChange={setTab} className="h-full flex flex-col">
          <div className="border-b bg-card px-6">
            <TabsList className="h-9 bg-transparent gap-0 p-0">
              {[
                { value: "board", label: "Board", icon: Kanban },
                { value: "backlog", label: "Work Plan", icon: List },
                { value: "calendar", label: "Calendar", icon: Calendar },
                { value: "gantt", label: "Gantt", icon: BarChart3 },
                { value: "timesheet", label: "Timesheet", icon: Clock },
                { value: "sprints", label: "Sprints", icon: Layers },
                { value: "resources", label: "Resources", icon: Users },
              ].map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-9 px-3 text-sm gap-1.5"
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </TabsTrigger>
              ))}
              {/* More dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium gap-1.5 rounded-none border-b-2 transition-all",
                    ["overview", "risks"].includes(tab)
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}>
                    <MoreHorizontal className="w-3.5 h-3.5" /> More <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {[
                    { value: "overview", label: "Overview", icon: Grid },
                    { value: "risks", label: "Risks", icon: AlertTriangle },
                  ].map(({ value, label, icon: Icon }) => (
                    <DropdownMenuItem key={value} onClick={() => setTab(value)} className={cn("gap-2", tab === value && "bg-accent")}>
                      <Icon className="w-4 h-4" /> {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-auto">
              <TabsContent value="board" className="mt-0 h-full">
                <KanbanBoard
                  tasks={tasks}
                  onUpdateTask={(id, status) => updateTask.mutate({ id, status })}
                  onAddTask={(status) => setShowCreateTask(true)}
                  projectId={project.id}
                  sprints={sprints}
                  milestones={milestones}
                  sections={sections}
                  onTaskClick={(task) => setSelectedTask(task)}
                />
              </TabsContent>
              <TabsContent value="backlog" className="mt-0 p-6">
                <div className="text-muted-foreground text-center py-10">Work Plan View Coming Soon</div>
              </TabsContent>
              <TabsContent value="calendar" className="mt-0">
                <div className="text-muted-foreground text-center py-10">Calendar View Coming Soon</div>
              </TabsContent>
              <TabsContent value="timesheet" className="mt-0">
                <div className="text-muted-foreground text-center py-10">Timesheet View Coming Soon</div>
              </TabsContent>
              <TabsContent value="resources" className="mt-0">
                <div className="text-muted-foreground text-center py-10">Resources Panel Coming Soon</div>
              </TabsContent>
              <TabsContent value="gantt" className="mt-0 p-4">
                <div className="text-muted-foreground text-center py-10">Gantt Chart Coming Soon</div>
              </TabsContent>
              <TabsContent value="sprints" className="mt-0 p-6">
                <div className="text-muted-foreground text-center py-10">Sprints Panel Coming Soon</div>
              </TabsContent>
              <TabsContent value="risks" className="mt-0 p-6">
                <div className="text-muted-foreground text-center py-10">Risks Panel Coming Soon</div>
              </TabsContent>
              <TabsContent value="overview" className="mt-0 p-6">
                <div className="text-muted-foreground text-center py-10">Project Overview Coming Soon</div>
              </TabsContent>
            </div>

            {/* Shared Task Detail Side Panel — overlapping */}
            {currentSelectedTask && (
              <>
                {/* Backdrop overlay — click to dismiss */}
                <div
                  className="fixed inset-0 z-40 bg-black/10"
                  onClick={() => setSelectedTask(null)}
                />
                <div className={cn(
                  "fixed right-0 bottom-0 z-50 border-l bg-card overflow-hidden shadow-[-8px_0_24px_-4px_hsl(var(--foreground)/0.12)] transition-all duration-200",
                  isFullView ? "w-full max-w-full" : "w-[540px] max-w-[95vw]"
                )} style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}>
                  <TaskDetailPanel
                    task={currentSelectedTask}
                    onClose={() => { setSelectedTask(null); setIsFullView(false); }}
                    projectId={project.id}
                    allTasks={tasks}
                    onSelectTask={(t) => setSelectedTask(t)}
                    onExpand={() => setIsFullView(prev => !prev)}
                  />
                </div>
              </>
            )}
          </div>
        </Tabs>
      </div>

      <CreateTaskModal
        open={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        projectId={project.id}
        sprints={sprints}
        milestones={milestones}
        sections={sections}
      />
    </div>
  );
}
