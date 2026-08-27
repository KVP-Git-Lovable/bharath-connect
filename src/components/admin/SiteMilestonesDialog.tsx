import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export interface MilestoneRow {
  id: string;
  site_id: string;
  name: string;
  start_date: string;
  end_date: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
  percent_complete: number;
  status: string;
  notes: string | null;
  is_active: boolean;
}

export const MILESTONE_STATUSES: { value: string; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "delayed", label: "Delayed" },
  { value: "on_hold", label: "On Hold" },
];

export function milestoneStatusLabel(status?: string | null) {
  return MILESTONE_STATUSES.find((s) => s.value === status)?.label || "Not Started";
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  not_started: "secondary",
  in_progress: "default",
  completed: "default",
  delayed: "destructive",
  on_hold: "outline",
};

interface FormState {
  name: string;
  start_date: string;
  end_date: string;
  actual_start_date: string;
  actual_end_date: string;
  percent_complete: number;
  status: string;
  notes: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  name: "",
  start_date: new Date().toISOString().split("T")[0],
  end_date: "",
  actual_start_date: "",
  actual_end_date: "",
  percent_complete: 0,
  status: "not_started",
  notes: "",
  is_active: true,
};

interface Props {
  siteId: string | null;
  siteName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SiteMilestonesDialog({ siteId, siteName, open, onOpenChange }: Props) {
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<MilestoneRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MilestoneRow | null>(null);

  const fetchMilestones = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("site_milestones")
      .select("*")
      .eq("site_id", siteId)
      .order("start_date");
    if (error) toast.error(error.message);
    else setMilestones((data || []) as MilestoneRow[]);
    setLoading(false);
  }, [siteId]);

  useEffect(() => {
    if (open && siteId) {
      setShowForm(false);
      fetchMilestones();
    }
  }, [open, siteId, fetchMilestones]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (m: MilestoneRow) => {
    setEditing(m);
    setForm({
      name: m.name,
      start_date: m.start_date,
      end_date: m.end_date,
      actual_start_date: m.actual_start_date || "",
      actual_end_date: m.actual_end_date || "",
      percent_complete: m.percent_complete ?? 0,
      status: m.status,
      notes: m.notes || "",
      is_active: m.is_active,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!siteId) return;
    if (!form.name.trim()) { toast.error("Milestone name is required"); return; }
    if (!form.start_date) { toast.error("Planned Start Date is required"); return; }
    if (!form.end_date) { toast.error("Planned End Date is required"); return; }
    if (form.end_date < form.start_date) { toast.error("Planned End cannot be before Planned Start"); return; }
    if (form.actual_start_date && form.actual_end_date && form.actual_end_date < form.actual_start_date) {
      toast.error("Actual End cannot be before Actual Start"); return;
    }
    const pct = Math.min(100, Math.max(0, Number(form.percent_complete) || 0));
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        actual_start_date: form.actual_start_date || null,
        actual_end_date: form.actual_end_date || null,
        percent_complete: pct,
        status: form.status,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("site_milestones").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Milestone updated");
      } else {
        const { error } = await supabase.from("site_milestones").insert({ site_id: siteId, ...payload });
        if (error) throw error;
        toast.success("Milestone created");
      }
      setShowForm(false);
      fetchMilestones();
    } catch (err: any) {
      toast.error(err.message || "Failed to save milestone");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("site_milestones").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Milestone deleted"); fetchMilestones(); }
    setDeleteTarget(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" /> Milestones{siteName ? ` — ${siteName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {showForm ? (
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            <div>
              <Label className="text-xs">Milestone Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Foundation Complete" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Planned Start *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Planned End *</Label>
                <Input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Actual Start</Label>
                <Input type="date" value={form.actual_start_date} onChange={(e) => setForm({ ...form, actual_start_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Actual End</Label>
                <Input type="date" value={form.actual_end_date} min={form.actual_start_date || undefined} onChange={(e) => setForm({ ...form, actual_end_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">% Completion</Label>
                <Input type="number" min={0} max={100} value={form.percent_complete} onChange={(e) => setForm({ ...form, percent_complete: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MILESTONE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active (available for selection in Activities)
            </label>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editing ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            <Button size="sm" onClick={openCreate} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Add Milestone
            </Button>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : milestones.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">No milestones yet.</p>
            ) : (
              <div className="space-y-2">
                {milestones.map((m) => (
                  <div key={m.id} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {m.name}
                        {!m.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}><Edit className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(m)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={STATUS_VARIANT[m.status] || "secondary"} className="text-[10px]">{milestoneStatusLabel(m.status)}</Badge>
                      <span className="text-xs text-muted-foreground">{m.percent_complete}% complete</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Planned: {format(new Date(m.start_date), "dd MMM yyyy")} → {format(new Date(m.end_date), "dd MMM yyyy")}
                    </div>
                    {(m.actual_start_date || m.actual_end_date) && (
                      <div className="text-xs text-muted-foreground">
                        Actual: {m.actual_start_date ? format(new Date(m.actual_start_date), "dd MMM yyyy") : "—"} → {m.actual_end_date ? format(new Date(m.actual_end_date), "dd MMM yyyy") : "—"}
                      </div>
                    )}
                    {m.notes && <p className="text-xs text-muted-foreground italic">{m.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}". Activities referencing it will lose the milestone link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
