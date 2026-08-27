import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useProjects, useDeleteProject } from "@/hooks/useProjects";
import { CreateProjectModal } from "@/components/pm/CreateProjectModal";
import {
  Plus, Search, FolderKanban, Calendar, Clock,
  ChevronRight, Trash2, MoreVertical, Filter, Layers
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  planning: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const priorityDot: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-amber-400", low: "bg-green-400",
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

  const filtered = projects.filter(p => {
    const matchSearch = (p.name || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === "active").length,
    planning: projects.filter(p => p.status === "planning").length,
    completed: projects.filter(p => p.status === "completed").length,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FolderKanban className="w-7 h-7 text-primary" />
              Projects
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Manage all your projects and track progress</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/templates")} className="gap-2">
              <Layers className="w-4 h-4" /> Templates
            </Button>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="w-4 h-4" /> New Project
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="flex gap-6 mt-4">
          {[
            { label: "Total", count: stats.total, color: "text-foreground" },
            { label: "Active", count: stats.active, color: "text-green-600 dark:text-green-400" },
            { label: "Planning", count: stats.planning, color: "text-blue-600 dark:text-blue-400" },
            { label: "Completed", count: stats.completed, color: "text-emerald-600 dark:text-emerald-400" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className={cn("text-xl font-bold", s.color)}>{s.count}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-4">
        {/* Filters */}
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9">
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Project Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FolderKanban className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {projects.length === 0 ? "No projects yet" : "No projects match your filters"}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {projects.length === 0 ? "Create your first project to get started." : "Try adjusting your search or filters."}
            </p>
            {projects.length === 0 && (
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Create First Project
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(project => {
              const progress = project.estimated_hours && project.estimated_hours > 0
                ? Math.min(100, Math.round((project.logged_hours ?? 0) / project.estimated_hours * 100))
                : null;

              return (
                <Card
                  key={project.id}
                  className="group cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 border"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                        <h3 className="font-semibold text-foreground truncate text-sm leading-tight">
                          {project.name}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColors[project.status])}>
                          {project.status.replace('_', ' ')}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}>
                              Open Project
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={e => { e.stopPropagation(); deleteProject.mutate(project.id); }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className={cn("w-2 h-2 rounded-full", priorityDot[project.priority])} />
                        {project.priority}
                      </span>
                      {project.end_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(project.end_date), "MMM d, yyyy")}
                        </span>
                      )}
                      {project.estimated_hours && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {project.logged_hours ?? 0}/{project.estimated_hours}h
                        </span>
                      )}
                    </div>

                    {progress !== null && (
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      {project.owner && (
                        <span className="text-xs text-muted-foreground truncate">{project.owner.full_name}</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
