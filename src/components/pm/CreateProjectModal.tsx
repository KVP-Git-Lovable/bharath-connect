import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateProject } from "@/hooks/useProjects";
import { useTemplates } from "@/hooks/useTemplates";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, DollarSign, Layers } from "lucide-react";
import { toast } from "sonner";
import { addDays, format } from "date-fns";

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ open, onClose }: Props) {
  const createProject = useCreateProject();
  const { data: templates = [] } = useTemplates();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "planning" as const,
    priority: "medium" as const,
    start_date: "",
    end_date: "",
    estimated_hours: "",
    budget: "",
    color: "#6366f1",
    template_id: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);

    try {
      const project = await createProject.mutateAsync({
        name: form.name,
        description: form.description || undefined,
        status: form.status,
        priority: form.priority,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : undefined,
        budget: form.budget ? parseFloat(form.budget) : undefined,
        color: form.color,
        is_template: false,
      });

      // If a template is selected and start_date is set, apply template
      if (form.template_id && form.start_date && project) {
        await applyTemplate(project.id, form.template_id, new Date(form.start_date));
      }

      setForm({ name: "", description: "", status: "planning", priority: "medium", start_date: "", end_date: "", estimated_hours: "", budget: "", color: "#6366f1", template_id: "" });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template Selection */}
          {templates.length > 0 && (
            <div className="p-3 border rounded-lg bg-muted/20 space-y-2">
              <Label className="flex items-center gap-1.5 text-primary">
                <Layers className="w-3.5 h-3.5" /> Use a Template
              </Label>
              <Select value={form.template_id || "__none"} onValueChange={v => setForm(f => ({ ...f, template_id: v === "__none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="No template (blank project)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No template (blank project)</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.template_id && !form.start_date && (
                <p className="text-xs text-amber-600">⚠ Set a Start Date below for auto-scheduling template tasks.</p>
              )}
            </div>
          )}

          <div>
            <Label>Project Name *</Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. QuickLocate v2.0 Launch"
              required
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief overview of the project..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">🔴 Critical</SelectItem>
                  <SelectItem value="high">🟠 High</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="low">🟢 Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Start Date {form.template_id ? "*" : ""}</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required={!!form.template_id} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Calendar className="w-3 h-3" /> End Date</Label>
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Estimated Hours</Label>
              <Input type="number" placeholder="e.g. 200" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> Budget</Label>
              <Input type="number" placeholder="e.g. 50000" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Project Color</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {PROJECT_COLORS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: form.color === c ? '#000' : 'transparent' }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : form.template_id ? "Create from Template" : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Apply Template Logic ───────────────────────────────
async function applyTemplate(projectId: string, templateId: string, startDate: Date) {
  try {
    // 1. Fetch template data
    const [sectionsRes, tasksRes, depsRes, attachmentsRes] = await Promise.all([
      supabase.from("pm_template_sections").select("*").eq("template_id", templateId).order("position"),
      supabase.from("pm_template_tasks").select("*").eq("template_id", templateId).order("sort_order"),
      supabase.from("pm_template_dependencies").select("*").eq("template_id", templateId),
      supabase.from("pm_template_attachments").select("*").eq("template_id", templateId),
    ]);

    const tSections = sectionsRes.data || [];
    const tTasks = tasksRes.data || [];
    const tDeps = depsRes.data || [];
    const tAttachments = attachmentsRes.data || [];

    // 2. Create sections & build ID mapping
    const sectionMap = new Map<string, string>(); // old → new
    for (const s of tSections) {
      const { data } = await supabase.from("pm_sections").insert({
        project_id: projectId, name: s.name, position: s.position, color: s.color,
      }).select().single();
      if (data) sectionMap.set(s.id, data.id);
    }

    // 3. Create tasks with cascading dates
    // First pass: root tasks (no parent_task_id) in sort order
    const taskMap = new Map<string, string>(); // old → new
    const taskDateMap = new Map<string, { start: Date; end: Date }>(); // new task id → dates

    // Separate root tasks and subtasks
    const rootTasks = tTasks.filter(t => !t.parent_task_id);
    const subTasks = tTasks.filter(t => !!t.parent_task_id);

    // Calculate dates: each root task starts after previous one ends
    let currentDate = new Date(startDate);
    for (const t of rootTasks) {
      const taskStart = new Date(currentDate);
      const taskEnd = addDays(taskStart, t.duration_days - 1);

      const { data } = await supabase.from("pm_tasks").insert({
        project_id: projectId,
        section_id: t.section_id ? sectionMap.get(t.section_id) || null : null,
        title: t.title,
        description: t.description,
        type: t.type,
        status: "todo",
        priority: t.priority,
        start_date: format(taskStart, "yyyy-MM-dd"),
        due_date: format(taskEnd, "yyyy-MM-dd"),
        estimated_hours: t.estimated_hours,
        sort_order: t.sort_order,
        tags: t.tags,
        created_by: (await supabase.auth.getUser()).data.user!.id,
      } as any).select().single();

      if (data) {
        taskMap.set(t.id, data.id);
        taskDateMap.set(data.id, { start: taskStart, end: taskEnd });
      }

      // Next task starts after this one
      currentDate = addDays(taskEnd, 1);
    }

    // Create subtasks — inherit parent's start date, cascade within parent
    for (const t of subTasks) {
      const parentNewId = taskMap.get(t.parent_task_id!);
      const parentDates = parentNewId ? taskDateMap.get(parentNewId) : null;
      const subStart = parentDates ? parentDates.start : startDate;
      const subEnd = addDays(subStart, t.duration_days - 1);

      const { data } = await supabase.from("pm_tasks").insert({
        project_id: projectId,
        parent_task_id: parentNewId || null,
        section_id: t.section_id ? sectionMap.get(t.section_id) || null : null,
        title: t.title,
        description: t.description,
        type: t.type,
        status: "todo",
        priority: t.priority,
        start_date: format(subStart, "yyyy-MM-dd"),
        due_date: format(subEnd, "yyyy-MM-dd"),
        estimated_hours: t.estimated_hours,
        sort_order: t.sort_order,
        tags: t.tags,
        created_by: (await supabase.auth.getUser()).data.user!.id,
      } as any).select().single();

      if (data) {
        taskMap.set(t.id, data.id);
      }
    }

    // 4. Create dependencies
    for (const d of tDeps) {
      const newTaskId = taskMap.get(d.task_id);
      const newDepTaskId = taskMap.get(d.depends_on_task_id);
      if (newTaskId && newDepTaskId) {
        await supabase.from("pm_task_dependencies").insert({
          task_id: newTaskId,
          depends_on_task_id: newDepTaskId,
          dependency_type: d.dependency_type,
        });
      }
    }

    // 5. Copy attachments (reference same files)
    for (const a of tAttachments) {
      const newTaskId = taskMap.get(a.task_id);
      if (newTaskId) {
        await supabase.from("pm_task_attachments").insert({
          task_id: newTaskId,
          file_name: a.file_name,
          file_url: a.file_url,
          file_size: a.file_size,
          file_type: a.file_type,
          note: a.note,
          uploaded_by: (await supabase.auth.getUser()).data.user!.id,
        });
      }
    }

    toast.success(`Template applied! ${rootTasks.length + subTasks.length} tasks created with scheduled dates.`);
  } catch (err: any) {
    console.error("Template application error:", err);
    toast.error("Template partially applied. Some items may not have been created.");
  }
}
