import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateTask, useAddTaskCollaborator, TaskStatus, TaskType, Priority, Sprint, Milestone, Section } from "@/hooks/useProjects";
import { MultiUserPicker } from "./MultiUserPicker";
import { Badge } from "@/components/ui/badge";
import { X, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UserInfo {
  id: string;
  full_name: string;
  profile_picture_url?: string;
}

// ── Reusable Owner Picker for the form ──────────────────────
function OwnerPickerField({ value, onChange }: { value: UserInfo | null; onChange: (u: UserInfo | null) => void }) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserInfo[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, profile_picture_url").ilike("full_name", `%${query}%`).limit(8);
      setResults(data || []);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowSearch(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div>
      <Label>Task Owner</Label>
      <div className="relative mt-1" ref={ref}>
        <button
          type="button"
          onClick={() => setShowSearch(!showSearch)}
          className="w-full flex items-center gap-2 text-sm border rounded-md px-3 py-2 hover:bg-muted/50 transition-colors text-left"
        >
          {value ? (
            <>
              <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-semibold">
                {value.full_name?.charAt(0) ?? "?"}
              </div>
              <span>{value.full_name}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(null); }} className="ml-auto text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <span className="text-muted-foreground italic">Auto-assigned to you</span>
          )}
        </button>
        {showSearch && (
          <div className="absolute top-full left-0 mt-1 w-full bg-popover border rounded-lg shadow-lg z-50 p-2">
            <div className="flex items-center gap-2 border-b pb-2 mb-1">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search users..."
                className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50" />
            </div>
            {results.map(u => (
              <button key={u.id} type="button" onClick={() => { onChange(u); setShowSearch(false); setQuery(""); }}
                className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted transition-colors">
                <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-semibold">
                  {u.full_name?.charAt(0) ?? "?"}
                </div>
                <span className="text-sm">{u.full_name}</span>
              </button>
            ))}
            {query && results.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1.5">No users found</p>}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  sprints?: Sprint[];
  milestones: Milestone[];
  sections: Section[];
  parentTaskId?: string;
  defaultStatus?: TaskStatus;
  defaultSectionId?: string;
}

export function CreateTaskModal({ open, onClose, projectId, sprints, milestones, sections, parentTaskId, defaultStatus, defaultSectionId }: Props) {
  const createTask = useCreateTask();
  const addCollaborator = useAddTaskCollaborator();
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "task" as TaskType,
    status: (defaultStatus ?? "todo") as TaskStatus,
    priority: "medium" as Priority,
    milestone_id: "",
    section_id: defaultSectionId || "",
    start_date: "",
    due_date: "",
    estimated_hours: "",
    story_points: "",
    tagInput: "",
    tags: [] as string[],
  });
  const [owner, setOwner] = useState<UserInfo | null>(null);
  const [collaborators, setCollaborators] = useState<UserInfo[]>([]);

  const addTag = () => {
    const t = form.tagInput.trim();
    if (t && !form.tags.includes(t)) {
      setForm(f => ({ ...f, tags: [...f.tags, t], tagInput: "" }));
    }
  };

  const removeTag = (tag: string) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const newTask = await createTask.mutateAsync({
      project_id: projectId,
      parent_task_id: parentTaskId ?? undefined,
      title: form.title,
      description: form.description || undefined,
      type: form.type,
      status: form.status,
      priority: form.priority,
      assignee_id: owner?.id || undefined,
      milestone_id: form.milestone_id || undefined,
      section_id: form.section_id || undefined,
      start_date: form.start_date || undefined,
      due_date: form.due_date || undefined,
      estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : undefined,
      story_points: form.story_points ? parseInt(form.story_points) : undefined,
      tags: form.tags.length ? form.tags : undefined,
    });
    // Add collaborators
    for (const collab of collaborators) {
      await addCollaborator.mutateAsync({ taskId: newTask.id, userId: collab.id });
    }
    setForm({ title: "", description: "", type: "task", status: defaultStatus ?? "todo", priority: "medium", milestone_id: "", section_id: defaultSectionId || "", start_date: "", due_date: "", estimated_hours: "", story_points: "", tagInput: "", tags: [] });
    setOwner(null);
    setCollaborators([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{parentTaskId ? "Add Subtask" : "Create Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title..." required />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Description</Label>
            </div>
            <Textarea
              value={form.description}
              onChange={e => {
                setForm(f => ({ ...f, description: e.target.value }));
                const el = e.target;
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = el.scrollHeight + "px";
                }
              }}
              rows={3}
              placeholder="Details, acceptance criteria..."
              className="resize-none overflow-hidden"
            />
          </div>

          {/* Owner */}
          <OwnerPickerField value={owner} onChange={setOwner} />

          {/* Collaborators */}
          <MultiUserPicker
            label="Collaborators"
            selectedUsers={collaborators}
            onAdd={(u) => setCollaborators(prev => [...prev, u])}
            onRemove={(id) => setCollaborators(prev => prev.filter(c => c.id !== id))}
            compact
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as TaskType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">✅ Task</SelectItem>
                  <SelectItem value="bug">🐛 Bug</SelectItem>
                  <SelectItem value="idea">💡 Idea</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TaskStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as Priority }))}>
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
          {sections.length > 0 && (
            <div>
              <Label>Section</Label>
              <Select value={form.section_id || "__none"} onValueChange={v => setForm(f => ({ ...f, section_id: v === "__none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="No section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No section</SelectItem>
                  {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Est. Hours</Label>
              <Input type="number" placeholder="0" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} />
            </div>
            <div>
              <Label>Story Points</Label>
              <Input type="number" placeholder="0" value={form.story_points} onChange={e => setForm(f => ({ ...f, story_points: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Tags</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={form.tagInput}
                onChange={e => setForm(f => ({ ...f, tagInput: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add tag, press Enter"
              />
              <Button type="button" variant="outline" onClick={addTag}>Add</Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            💡 Sub-tasks, dependencies, and attachments can be added after creating the task via the task detail panel.
          </p>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
