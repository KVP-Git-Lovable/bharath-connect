import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Edit, Users, Download, Building2, Image as ImageIcon,
  Target, Activity as ActivityIcon, FileText, X, Plus,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getSiteAttachmentUrl } from "@/utils/siteAttachments";
import { useSiteHub } from "@/hooks/useSiteHub";
import { MILESTONE_STATUSES } from "@/components/admin/SiteMilestonesDialog";
import SiteGallery from "@/components/admin/site-hub/SiteGallery";
import SiteMilestoneList from "@/components/admin/site-hub/SiteMilestoneList";
import SiteActivityList from "@/components/admin/site-hub/SiteActivityList";
import ActivityDetailsDialog from "@/components/activities/ActivityDetailsDialog";
import type { Activity } from "@/hooks/useActivities";

export interface HubSite {
  id: string;
  site_name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
}

const STATUSES: { value: string; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "started", label: "Started" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

interface Props {
  site: HubSite | null;
  open: boolean;
  onClose: () => void;
  onEdit: (site: HubSite) => void;
  onStatusChanged?: () => void;
}

export default function SiteHubSheet({ site, open, onClose, onEdit, onStatusChanged }: Props) {
  const { loading, milestones, activities, assignedUsers, gallery, documents, attendanceByActivity, reload } = useSiteHub(open ? site?.id ?? null : null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [subParentName, setSubParentName] = useState<string>("");
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [msForm, setMsForm] = useState({
    name: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
    actual_start_date: "",
    actual_end_date: "",
    notes: "",
    percent_complete: 0,
    status: "not_started",
    is_active: true,
    parent_id: "" as string,
  });
  const [savingMilestone, setSavingMilestone] = useState(false);

  const openAddSubMilestone = (parentId: string, parentName: string) => {
    setEditingMilestoneId(null);
    setSubParentName(parentName);
    setMsForm({
      name: "",
      start_date: new Date().toISOString().split("T")[0],
      end_date: "",
      actual_start_date: "",
      actual_end_date: "",
      notes: "",
      percent_complete: 0,
      status: "not_started",
      is_active: true,
      parent_id: parentId,
    });
    setShowAddMilestone(true);
  };

  const openAddTopMilestone = () => {
    setEditingMilestoneId(null);
    setSubParentName("");
    setMsForm((f) => ({ ...f, parent_id: "" }));
    setShowAddMilestone(true);
  };

  const openEditMilestone = (m: import("@/hooks/useSiteHub").HubMilestone) => {
    setEditingMilestoneId(m.id);
    const parent = m.parent_id ? milestones.find((x) => x.id === m.parent_id) : null;
    setSubParentName(parent?.name || "");
    setMsForm({
      name: m.name,
      start_date: m.start_date,
      end_date: m.end_date,
      actual_start_date: m.actual_start_date || "",
      actual_end_date: m.actual_end_date || "",
      notes: m.notes || "",
      percent_complete: m.percent_complete ?? 0,
      status: m.status,
      is_active: m.is_active,
      parent_id: m.parent_id || "",
    });
    setShowAddMilestone(true);
  };

  const currentStatus = status ?? site?.status ?? "planned";

  const avgProgress = milestones.length
    ? Math.round(milestones.reduce((s, m) => s + (m.percent_complete || 0), 0) / milestones.length)
    : 0;

  const handleStatusChange = async (value: string) => {
    if (!site) return;
    setStatus(value);
    setSavingStatus(true);
    const { error } = await supabase
      .from("project_sites")
      .update({ status: value, is_active: value !== "dropped" })
      .eq("id", site.id);
    setSavingStatus(false);
    if (error) {
      toast.error("Could not update status");
      setStatus(site.status);
    } else {
      toast.success("Status updated");
      onStatusChanged?.();
    }
  };

  const openDoc = async (stored: string) => {
    const url = await getSiteAttachmentUrl(stored);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open file");
  };

  const openActivityById = (id: string) => {
    const a = activities.find((x) => x.id === id);
    if (a) setSelectedActivity(a);
  };

  const handleSaveMilestone = async () => {
    if (!site) return;
    if (!msForm.name.trim()) { toast.error("Milestone name is required"); return; }
    if (!msForm.start_date) { toast.error("Planned Start Date is required"); return; }
    if (!msForm.end_date) { toast.error("Planned End Date is required"); return; }
    if (msForm.end_date < msForm.start_date) { toast.error("Planned End cannot be before Planned Start"); return; }
    if (msForm.actual_start_date && msForm.actual_end_date && msForm.actual_end_date < msForm.actual_start_date) {
      toast.error("Actual End cannot be before Actual Start"); return;
    }
    const pct = Math.min(100, Math.max(0, Number(msForm.percent_complete) || 0));
    setSavingMilestone(true);
    try {
      const payload = {
        name: msForm.name.trim(),
        start_date: msForm.start_date,
        end_date: msForm.end_date,
        actual_start_date: msForm.actual_start_date || null,
        actual_end_date: msForm.actual_end_date || null,
        notes: msForm.notes.trim() || null,
        percent_complete: pct,
        status: msForm.status || (pct >= 100 ? "completed" : pct > 0 ? "in_progress" : "not_started"),
        is_active: msForm.is_active,
        parent_id: msForm.parent_id || null,
      };
      if (editingMilestoneId) {
        const { error } = await supabase.from("site_milestones").update(payload).eq("id", editingMilestoneId);
        if (error) throw error;
        toast.success("Milestone updated");
      } else {
        const { error } = await supabase.from("site_milestones").insert({ site_id: site.id, ...payload });
        if (error) throw error;
        toast.success(msForm.parent_id ? "Sub-task added" : "Milestone added");
      }
      setShowAddMilestone(false);
      setSubParentName("");
      setEditingMilestoneId(null);
      setMsForm({
        name: "",
        start_date: new Date().toISOString().split("T")[0],
        end_date: "",
        actual_start_date: "",
        actual_end_date: "",
        notes: "",
        percent_complete: 0,
        status: "not_started",
        is_active: true,
        parent_id: "",
      });
      reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to save milestone");
    } finally {
      setSavingMilestone(false);
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) { setStatus(null); setActiveTab("overview"); onClose(); }
  };

  if (!site) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="p-0 gap-0 max-w-none w-screen h-[100dvh] rounded-none flex flex-col overflow-hidden border-0 [&>button]:hidden"
        >
          <div className="relative shrink-0 bg-gradient-primary text-primary-foreground px-4 sm:px-8 safe-top-8 sm:safe-top-10 pb-6 sm:pb-8">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:right-6 sm:top-[calc(0.75rem+env(safe-area-inset-top,0px))] rounded-full p-1.5 bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="max-w-6xl mx-auto w-full">
              <div className="flex items-start gap-4 pr-10">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-primary-foreground/15 flex items-center justify-center shrink-0 mt-1">
                  <Building2 className="h-7 w-7 sm:h-8 sm:w-8" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl sm:text-2xl font-bold truncate leading-tight">{site?.site_name}</h2>
                  <p className="text-xs sm:text-sm text-primary-foreground/70 mt-1.5">
                    {site?.start_date ? format(new Date(site.start_date), "dd MMM yyyy") : "—"}
                    {" – "}
                    {site?.end_date ? format(new Date(site.end_date), "dd MMM yyyy") : "Ongoing"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-6 sm:mt-7">
                <Select value={currentStatus} onValueChange={handleStatusChange} disabled={savingStatus}>
                  <SelectTrigger className="h-9 w-[150px] rounded-full text-xs font-semibold bg-primary-foreground/10 border-primary-foreground/25 text-primary-foreground">
                    {savingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 ml-auto"
                  onClick={() => site && onEdit(site)}
                >
                  <Edit className="h-3.5 w-3.5 mr-1" /> Edit Site
                </Button>
                {activeTab === "milestones" && site && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-9"
                    onClick={openAddTopMilestone}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Milestone
                  </Button>
                )}
              </div>
            </div>
          </div>

          {loading && milestones.length === 0 && activities.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-3 sm:px-8 pt-3 border-b">
                <TabsList className="w-full max-w-6xl mx-auto justify-start overflow-x-auto bg-transparent p-0 h-auto gap-1">
                  {[
                    ["overview", "Overview"],
                    ["milestones", "Milestones"],
                    ["activities", "Activities"],
                    ["gallery", "Gallery"],
                    ["documents", "Documents"],
                  ].map(([v, l]) => (
                    <TabsTrigger
                      key={v}
                      value={v}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 pb-2.5 whitespace-nowrap"
                    >
                      {l}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 safe-bottom">
                <div className="max-w-6xl mx-auto w-full">
                  <TabsContent value="overview" className="mt-0 space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-xl border bg-card p-3.5 text-center shadow-card">
                        <Target className="h-5 w-5 mx-auto text-info mb-1.5" />
                        <p className="text-xl font-bold">{milestones.length}</p>
                        <p className="text-[11px] text-muted-foreground">Milestones</p>
                      </div>
                      <div className="rounded-xl border bg-card p-3.5 text-center shadow-card">
                        <ActivityIcon className="h-5 w-5 mx-auto text-warning mb-1.5" />
                        <p className="text-xl font-bold">{activities.length}</p>
                        <p className="text-[11px] text-muted-foreground">Activities</p>
                      </div>
                      <div className="rounded-xl border bg-card p-3.5 text-center shadow-card">
                        <ImageIcon className="h-5 w-5 mx-auto text-success mb-1.5" />
                        <p className="text-xl font-bold">{gallery.length}</p>
                        <p className="text-[11px] text-muted-foreground">Photos</p>
                      </div>
                      <div className="rounded-xl border bg-card p-3.5 text-center shadow-card">
                        <Users className="h-5 w-5 mx-auto text-primary mb-1.5" />
                        <p className="text-xl font-bold">{assignedUsers.length}</p>
                        <p className="text-[11px] text-muted-foreground">Team</p>
                      </div>
                    </div>

                    {site?.description && (
                      <div className="rounded-xl border bg-muted/30 p-4">
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <p className="text-sm mt-1">{site.description}</p>
                      </div>
                    )}

                    <div className="rounded-xl border bg-card p-4 shadow-card space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">Overall progress</span>
                        <span className="font-bold">{avgProgress}%</span>
                      </div>
                      <Progress value={avgProgress} className="h-2.5" />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2.5">
                        <Users className="h-3.5 w-3.5" /> Assigned Users ({assignedUsers.length})
                      </Label>
                      {assignedUsers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No users assigned</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {assignedUsers.map((u) => (
                            <div key={u.id} className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5">
                              <Avatar className="h-8 w-8"><AvatarFallback className="text-[11px] bg-primary/10 text-primary">{initials(u.full_name)}</AvatarFallback></Avatar>
                              <span className="text-sm font-medium truncate">{u.full_name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="milestones" className="mt-0">
                    <SiteMilestoneList siteId={site!.id} milestones={milestones} activities={activities} onChanged={reload} onAddSubMilestone={openAddSubMilestone} onEditMilestone={openEditMilestone} onOpenActivity={setSelectedActivity} />
                  </TabsContent>

                  <TabsContent value="gallery" className="mt-0">
                    <SiteGallery gallery={gallery} onActivityClick={openActivityById} />
                  </TabsContent>

                  <TabsContent value="activities" className="mt-0">
                    <SiteActivityList activities={activities} onOpen={setSelectedActivity} />
                  </TabsContent>

                  <TabsContent value="documents" className="mt-0">
                    {documents.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No documents uploaded.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {documents.map((d, i) => (
                          <button key={i} type="button" onClick={() => openDoc(d.stored)}
                            className="flex items-center gap-2 text-sm text-primary hover:underline w-full text-left border rounded-lg px-3 py-2.5">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate flex-1">{d.name}</span>
                            <Download className="h-4 w-4 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </div>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAddMilestone} onOpenChange={(o) => { setShowAddMilestone(o); if (!o) setEditingMilestoneId(null); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {editingMilestoneId
                ? `Edit ${msForm.parent_id ? "Sub-Task" : "Milestone"}`
                : msForm.parent_id ? `Add Sub-Task${subParentName ? ` — under ${subParentName}` : ""}` : "Add Milestone"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto max-h-[70vh] pr-1">
            <div>
              <Label className="text-xs">Milestone Name *</Label>
              <Input value={msForm.name} onChange={(e) => setMsForm({ ...msForm, name: e.target.value })} placeholder="e.g. Foundation Complete" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Planned Start *</Label>
                <Input type="date" value={msForm.start_date} onChange={(e) => setMsForm({ ...msForm, start_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Planned End *</Label>
                <Input type="date" value={msForm.end_date} min={msForm.start_date || undefined} onChange={(e) => setMsForm({ ...msForm, end_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Actual Start</Label>
                <Input type="date" value={msForm.actual_start_date} onChange={(e) => setMsForm({ ...msForm, actual_start_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Actual End</Label>
                <Input type="date" value={msForm.actual_end_date} min={msForm.actual_start_date || undefined} onChange={(e) => setMsForm({ ...msForm, actual_end_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">% Completion</Label>
                <Input type="number" min={0} max={100} value={msForm.percent_complete} onChange={(e) => setMsForm({ ...msForm, percent_complete: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={msForm.status} onValueChange={(v) => setMsForm({ ...msForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MILESTONE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={msForm.notes} onChange={(e) => setMsForm({ ...msForm, notes: e.target.value })} placeholder="Optional notes..." rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={msForm.is_active} onChange={(e) => setMsForm({ ...msForm, is_active: e.target.checked })} />
              Active (available for selection in Activities)
            </label>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddMilestone(false)} disabled={savingMilestone}>Cancel</Button>
              <Button className="flex-1" onClick={handleSaveMilestone} disabled={savingMilestone}>
                {savingMilestone ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ActivityDetailsDialog
        activity={selectedActivity}
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        attendance={selectedActivity ? attendanceByActivity[selectedActivity.id] : null}
      />
    </>
  );
}
