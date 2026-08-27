import { useState } from "react";
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
import { Plus, Edit, Trash2, Target, ListChecks } from "lucide-react";
import { format } from "date-fns";
import { MILESTONE_STATUSES, milestoneStatusLabel } from "@/components/admin/SiteMilestonesDialog";

export interface LocalMilestone {
  id?: string; // db id if existing
  key: string; // local stable key
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  not_started: "secondary",
  in_progress: "default",
  completed: "default",
  delayed: "destructive",
  on_hold: "outline",
};

function emptyMilestone(): LocalMilestone {
  return {
    key: crypto.randomUUID(),
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
}

interface Props {
  value: LocalMilestone[];
  onChange: (next: LocalMilestone[]) => void;
}

export default function SiteMilestonesEditor({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<LocalMilestone>(emptyMilestone());
  const [error, setError] = useState("");

  const openCreate = () => {
    setDraft(emptyMilestone());
    setError("");
    setShowForm(true);
  };

  const openEdit = (m: LocalMilestone) => {
    setDraft({ ...m });
    setError("");
    setShowForm(true);
  };

  const remove = (key: string) => {
    onChange(value.filter((m) => m.key !== key));
  };

  const save = () => {
    if (!draft.name.trim()) { setError("Milestone name is required"); return; }
    if (!draft.start_date) { setError("Planned Start is required"); return; }
    if (!draft.end_date) { setError("Planned End is required"); return; }
    if (draft.end_date < draft.start_date) { setError("Planned End cannot be before Planned Start"); return; }
    if (draft.actual_start_date && draft.actual_end_date && draft.actual_end_date < draft.actual_start_date) {
      setError("Actual End cannot be before Actual Start"); return;
    }
    const pct = Math.min(100, Math.max(0, Number(draft.percent_complete) || 0));
    const cleaned: LocalMilestone = { ...draft, name: draft.name.trim(), percent_complete: pct, notes: draft.notes.trim() };
    const exists = value.some((m) => m.key === cleaned.key);
    onChange(exists ? value.map((m) => (m.key === cleaned.key ? cleaned : m)) : [...value, cleaned]);
    setShowForm(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setShowForm(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5" /> Milestones
      </Label>

      <Button
        type="button"
        variant="outline"
        className="w-full justify-between font-normal"
        onClick={() => { setShowForm(false); setOpen(true); }}
      >
        <span className="flex items-center gap-2">
          <ListChecks className="h-4 w-4" />
          {value.length > 0 ? "Manage Milestones" : "Add Milestone"}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {value.length} milestone{value.length === 1 ? "" : "s"}
        </Badge>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[520px] max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" /> Manage Milestones
            </DialogTitle>
          </DialogHeader>

          {showForm ? (
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              <div>
                <Label className="text-xs">Milestone Name *</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Foundation Complete" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Planned Start *</Label>
                  <Input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Planned End *</Label>
                  <Input type="date" value={draft.end_date} min={draft.start_date || undefined} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Actual Start</Label>
                  <Input type="date" value={draft.actual_start_date} onChange={(e) => setDraft({ ...draft, actual_start_date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Actual End</Label>
                  <Input type="date" value={draft.actual_end_date} min={draft.actual_start_date || undefined} onChange={(e) => setDraft({ ...draft, actual_end_date: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">% Completion</Label>
                  <Input type="number" min={0} max={100} value={draft.percent_complete} onChange={(e) => setDraft({ ...draft, percent_complete: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MILESTONE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} placeholder="Optional notes..." />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                Active (available for selection in Activities)
              </label>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="button" className="flex-1" onClick={save}>Save Milestone</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              <Button type="button" size="sm" onClick={openCreate} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add Milestone
              </Button>
              {value.length === 0 ? (
                <p className="text-center py-8 text-sm text-muted-foreground">No milestones yet.</p>
              ) : (
                <div className="space-y-2">
                  {value.map((m) => (
                    <div key={m.key} className="border rounded-lg p-2.5 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium flex items-center gap-2">
                          {m.name}
                          {!m.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}><Edit className="h-3.5 w-3.5" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(m.key)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={STATUS_VARIANT[m.status] || "secondary"} className="text-[10px]">{milestoneStatusLabel(m.status)}</Badge>
                        <span className="text-xs text-muted-foreground">{m.percent_complete}% complete</span>
                      </div>
                      {m.start_date && m.end_date && (
                        <div className="text-xs text-muted-foreground">
                          Planned: {format(new Date(m.start_date), "dd MMM yyyy")} → {format(new Date(m.end_date), "dd MMM yyyy")}
                        </div>
                      )}
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
              <Button type="button" className="w-full" onClick={() => setOpen(false)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
