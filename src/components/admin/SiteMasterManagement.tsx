import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Loader2, Building2, Users, Check, ChevronsUpDown, X,
  Paperclip, Download,
} from "lucide-react";
import { toast } from "sonner";
import SiteMilestonesEditor, { LocalMilestone } from "@/components/admin/SiteMilestonesEditor";
import {
  uploadSiteAttachment,
  attachmentName,
  getSiteAttachmentUrl,
} from "@/utils/siteAttachments";
import SiteCard from "@/components/admin/site-hub/SiteCard";
import SiteHubSheet, { type HubSite } from "@/components/admin/site-hub/SiteHubSheet";
import { motion } from "framer-motion";

type SiteFlag = "red" | "orange" | "green";
type SiteStatus = "planned" | "started" | "completed" | "dropped";

interface Site {
  id: string;
  site_name: string;
  site_code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  start_date: string;
  end_date: string | null;
  flag: SiteFlag;
  status: SiteStatus;
  attachment_urls: string[];
}

interface UserOption {
  id: string;
  full_name: string;
}

export const SITE_STATUSES: { value: SiteStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "started", label: "Started" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

export function siteStatusLabel(status?: string | null) {
  return SITE_STATUSES.find((s) => s.value === status)?.label || "Planned";
}

interface FormState {
  site_name: string;
  description: string;
  start_date: string;
  end_date: string;
  status: SiteStatus;
}

const emptyForm: FormState = {
  site_name: "",
  description: "",
  start_date: new Date().toISOString().split("T")[0],
  end_date: "",
  status: "planned",
};

function UserMultiSelect({
  users, selected, onChange,
}: { users: UserOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const selectedUsers = users.filter((u) => selected.includes(u.id));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
            {selected.length === 0 ? "Select users..." : `${selected.length} user${selected.length > 1 ? "s" : ""} selected`}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search users..." />
            <CommandList>
              <CommandEmpty>No users found.</CommandEmpty>
              <CommandGroup>
                {users.map((u) => {
                  const isSel = selected.includes(u.id);
                  return (
                    <CommandItem key={u.id} value={u.full_name} onSelect={() => toggle(u.id)}>
                      <Check className={`mr-2 h-4 w-4 ${isSel ? "opacity-100" : "opacity-0"}`} />
                      {u.full_name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map((u) => (
            <Badge key={u.id} variant="secondary" className="gap-1 pr-1">
              {u.full_name}
              <button type="button" onClick={() => toggle(u.id)} className="rounded-full hover:bg-muted-foreground/20">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SiteMasterManagement() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [siteAssignments, setSiteAssignments] = useState<Record<string, string[]>>({});
  const [milestones, setMilestones] = useState<LocalMilestone[]>([]);
  const [originalMilestoneIds, setOriginalMilestoneIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [detailSite, setDetailSite] = useState<Site | null>(null);
  const [milestoneStats, setMilestoneStats] = useState<Record<string, { avg: number; count: number }>>({});

  const fetchMilestoneStats = useCallback(async () => {
    const { data } = await supabase.from("site_milestones").select("site_id, percent_complete, parent_id");
    const acc: Record<string, { sum: number; count: number }> = {};
    (data || []).forEach((m: any) => {
      if (m.parent_id) return;
      if (!acc[m.site_id]) acc[m.site_id] = { sum: 0, count: 0 };
      acc[m.site_id].sum += m.percent_complete ?? 0;
      acc[m.site_id].count += 1;
    });
    const stats: Record<string, { avg: number; count: number }> = {};
    Object.entries(acc).forEach(([id, v]) => {
      stats[id] = { avg: v.count ? Math.round(v.sum / v.count) : 0, count: v.count };
    });
    setMilestoneStats(stats);
  }, []);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from("users").select("id, full_name").eq("is_active", true).order("full_name");
    setAllUsers((data || []).map((u: any) => ({ id: u.id, full_name: u.full_name || "Unnamed" })));
  }, []);

  const fetchAssignments = useCallback(async () => {
    const { data } = await supabase.from("site_assignments").select("site_id, user_id");
    const map: Record<string, string[]> = {};
    (data || []).forEach((a: any) => {
      if (!map[a.site_id]) map[a.site_id] = [];
      map[a.site_id].push(a.user_id);
    });
    setSiteAssignments(map);
  }, []);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("project_sites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setSites((data || []).map((s: any) => ({
        ...s,
        flag: s.flag || "green",
        status: s.status || "planned",
        attachment_urls: s.attachment_urls || [],
      })) as Site[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSites();
    fetchUsers();
    fetchAssignments();
    fetchMilestoneStats();
  }, [fetchSites, fetchUsers, fetchAssignments, fetchMilestoneStats]);

  const handleOpenCreate = () => {
    setEditingSite(null);
    setForm(emptyForm);
    setSelectedUserIds([]);
    setMilestones([]);
    setOriginalMilestoneIds([]);
    setAttachments([]);
    setShowDialog(true);
  };

  const handleOpenEdit = async (site: Site) => {
    setEditingSite(site);
    setForm({
      site_name: site.site_name,
      description: site.description || "",
      start_date: site.start_date || "",
      end_date: site.end_date || "",
      status: site.status || "planned",
    });
    setSelectedUserIds(siteAssignments[site.id] || []);
    setAttachments(site.attachment_urls || []);
    setDetailSite(null);
    const { data } = await supabase.from("site_milestones").select("*").eq("site_id", site.id).order("start_date");
    const loaded: LocalMilestone[] = (data || []).map((m: any) => ({
      id: m.id,
      key: m.id,
      name: m.name,
      start_date: m.start_date,
      end_date: m.end_date,
      actual_start_date: m.actual_start_date || "",
      actual_end_date: m.actual_end_date || "",
      percent_complete: m.percent_complete ?? 0,
      status: m.status,
      notes: m.notes || "",
      is_active: m.is_active,
    }));
    setMilestones(loaded);
    setOriginalMilestoneIds(loaded.map((m) => m.id!).filter(Boolean));
    setShowDialog(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of files) {
        uploaded.push(await uploadSiteAttachment(f));
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const openAttachment = async (stored: string) => {
    const url = await getSiteAttachmentUrl(stored);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open file");
  };

  const persistMilestones = async (siteId: string) => {
    const currentIds = milestones.map((m) => m.id).filter(Boolean) as string[];
    const toDelete = originalMilestoneIds.filter((id) => !currentIds.includes(id));
    if (toDelete.length > 0) {
      await supabase.from("site_milestones").delete().in("id", toDelete);
    }
    for (const m of milestones) {
      const payload = {
        name: m.name,
        start_date: m.start_date,
        end_date: m.end_date,
        actual_start_date: m.actual_start_date || null,
        actual_end_date: m.actual_end_date || null,
        percent_complete: m.percent_complete,
        status: m.status,
        notes: m.notes || null,
        is_active: m.is_active,
      };
      if (m.id) {
        await supabase.from("site_milestones").update(payload).eq("id", m.id);
      } else {
        await supabase.from("site_milestones").insert({ site_id: siteId, ...payload });
      }
    }
  };

  const handleSave = async () => {
    const trimmed = form.site_name.trim();
    if (!trimmed) return;
    if (!form.start_date) { toast.error("Start Date is required"); return; }
    if (form.end_date && form.end_date < form.start_date) { toast.error("End Date cannot be earlier than Start Date"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let siteId: string;
      const payload: any = {
        site_name: trimmed,
        description: form.description || null,
        start_date: form.start_date,
        end_date: form.end_date || null,
        status: form.status,
        is_active: form.status !== "dropped",
        attachment_urls: attachments,
      };

      let userIds = [...selectedUserIds];

      if (editingSite) {
        const { error } = await supabase.from("project_sites").update(payload).eq("id", editingSite.id);
        if (error) throw error;
        siteId = editingSite.id;
        toast.success("Site updated");
      } else {
        payload.created_by = user?.id;
        const { data: newSite, error } = await supabase.from("project_sites").insert(payload).select("id").single();
        if (error) throw error;
        siteId = newSite.id;
        if (user?.id && !userIds.includes(user.id)) userIds.push(user.id);
        toast.success("Site created");
      }

      const currentAssigned = siteAssignments[siteId] || [];
      const toRemove = currentAssigned.filter((uid) => !userIds.includes(uid));
      const toAdd = userIds.filter((uid) => !currentAssigned.includes(uid));
      if (toRemove.length > 0) {
        await supabase.from("site_assignments").delete().eq("site_id", siteId).in("user_id", toRemove);
      }
      if (toAdd.length > 0) {
        await supabase.from("site_assignments").insert(toAdd.map((uid) => ({ site_id: siteId, user_id: uid, assigned_by: user?.id })));
      }

      await persistMilestones(siteId);

      setShowDialog(false);
      fetchSites();
      fetchAssignments();
      fetchMilestoneStats();
    } catch (err: any) {
      toast.error(err.message || "Failed to save site");
    } finally {
      setSaving(false);
    }
  };

  const getAssignedNames = (siteId: string) => {
    const ids = siteAssignments[siteId] || [];
    return ids.map((id) => allUsers.find((u) => u.id === id)?.full_name || "Unknown");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Project / Site
        </CardTitle>
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Site
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sites.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No sites created yet. Click "Add Site" to create one.
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          >
            {sites.map((site) => {
              const stats = milestoneStats[site.id] || { avg: 0, count: 0 };
              return (
                <motion.div
                  key={site.id}
                  variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                >
                  <SiteCard
                    site={site}
                    assignedNames={getAssignedNames(site.id)}
                    progress={stats.avg}
                    milestoneCount={stats.count}
                    onOpen={() => setDetailSite(site)}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </CardContent>

      <SiteHubSheet
        site={detailSite as HubSite | null}
        open={!!detailSite}
        onClose={() => setDetailSite(null)}
        onStatusChanged={() => fetchSites()}
        onEdit={(s) => {
          const full = sites.find((x) => x.id === s.id);
          if (full) handleOpenEdit(full);
        }}
      />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[460px] max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingSite ? "Edit Site" : "Add New Site"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2 overflow-y-auto flex-1 pr-1">
            <div>
              <Label className="text-xs">Site Name *</Label>
              <Input value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} placeholder="e.g. Koramangala Site" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start Date *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as SiteStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SITE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1.5 mb-2">
                <Users className="h-3.5 w-3.5" /> Assign Users
              </Label>
              <UserMultiSelect users={allUsers} selected={selectedUserIds} onChange={setSelectedUserIds} />
            </div>

            <SiteMilestonesEditor value={milestones} onChange={setMilestones} />

            <div>
              <Label className="text-xs flex items-center gap-1.5 mb-2">
                <Paperclip className="h-3.5 w-3.5" /> Attachments
              </Label>
              <div className="space-y-1.5 mb-2">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border rounded-lg px-2.5 py-1.5">
                    <button type="button" onClick={() => openAttachment(a)} className="flex items-center gap-2 text-sm text-primary hover:underline truncate">
                      <Download className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{attachmentName(a)}</span>
                    </button>
                    <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="text-destructive shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <label className="flex items-center justify-center gap-2 border border-dashed rounded-lg py-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {uploading ? "Uploading..." : "Add files / photos / documents"}
                <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving || !form.site_name.trim() || !form.start_date}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? "Saving..." : editingSite ? "Update Site" : "Create Site"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
