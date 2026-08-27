import React, { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Edit2, Trash2, Users, UserPlus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExpenseGroup {
  id: string;
  name: string;
  description: string | null;
  ta_type: "fixed" | "from_gps";
  fixed_ta_amount: number;
  ta_per_km_rate: number;
  da_amount: number;
  member_count?: number;
}

interface Props {
  field: "ta" | "da";
  groups: ExpenseGroup[];
  reload: () => void;
}

export default function ExpenseGroupsInline({ field, groups, reload }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseGroup | null>(null);
  const [form, setForm] = useState({
    name: "", description: "",
    ta_type: "fixed" as "fixed" | "from_gps",
    fixed_ta_amount: 0, ta_per_km_rate: 0, da_amount: 0,
  });
  const [saving, setSaving] = useState(false);

  const [membersOpen, setMembersOpen] = useState(false);
  const [membersGroup, setMembersGroup] = useState<ExpenseGroup | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");

  const filtered = groups.filter((g) =>
    field === "ta"
      ? g.fixed_ta_amount > 0 || g.ta_per_km_rate > 0
      : g.da_amount > 0
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", ta_type: "fixed", fixed_ta_amount: 0, ta_per_km_rate: 0, da_amount: 0 });
    setDialogOpen(true);
  };
  const openEdit = (g: ExpenseGroup) => {
    setEditing(g);
    setForm({
      name: g.name, description: g.description || "",
      ta_type: g.ta_type, fixed_ta_amount: g.fixed_ta_amount,
      ta_per_km_rate: g.ta_per_km_rate, da_amount: g.da_amount,
    });
    setDialogOpen(true);
  };
  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    const payload = { ...form, name: form.name.trim(), description: form.description || null };
    const { error } = editing
      ? await supabase.from("expense_groups" as any).update(payload).eq("id", editing.id)
      : await supabase.from("expense_groups" as any).insert(payload);
    setSaving(false);
    if (error) { toast.error("Failed to save group"); return; }
    toast.success(editing ? "Group updated" : "Group created");
    setDialogOpen(false);
    reload();
  };
  const remove = async (g: ExpenseGroup) => {
    if (!confirm(`Delete group "${g.name}"?`)) return;
    const { error } = await supabase.from("expense_groups" as any).delete().eq("id", g.id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Deleted");
    reload();
  };

  const openMembers = async (g: ExpenseGroup) => {
    setMembersGroup(g);
    const [{ data: users }, { data: current }] = await Promise.all([
      supabase.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("expense_group_members" as any).select("user_id").eq("group_id", g.id),
    ]);
    setAllUsers((users || []) as any);
    setSelectedMembers(new Set(((current || []) as any[]).map((r) => r.user_id)));
    setMemberSearch("");
    setMembersOpen(true);
  };
  const saveMembers = async () => {
    if (!membersGroup) return;
    const { data: current } = await supabase.from("expense_group_members" as any)
      .select("user_id").eq("group_id", membersGroup.id);
    const currentIds = new Set(((current || []) as any[]).map((r) => r.user_id));
    const toAdd = [...selectedMembers].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !selectedMembers.has(id));
    if (toAdd.length) {
      await supabase.from("expense_group_members" as any).insert(toAdd.map((user_id) => ({ group_id: membersGroup.id, user_id })));
    }
    if (toRemove.length) {
      await supabase.from("expense_group_members" as any).delete().eq("group_id", membersGroup.id).in("user_id", toRemove);
    }
    toast.success("Members updated");
    setMembersOpen(false);
    reload();
  };

  const filteredUsers = memberSearch.trim()
    ? allUsers.filter((u) => (u.full_name || "").toLowerCase().includes(memberSearch.toLowerCase()))
    : allUsers;

  return (
    <div className="mt-4 pt-4 border-t space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {field === "ta" ? "TA" : "DA"} Group Overrides
        </p>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={openCreate}>
          <Plus className="h-3 w-3" />Create {field === "ta" ? "TA" : "DA"} Group
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">No {field === "ta" ? "TA" : "DA"} groups yet.</p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] px-2">Group</TableHead>
                <TableHead className="text-[11px] px-2">{field === "ta" ? "TA" : "DA"}</TableHead>
                <TableHead className="text-[11px] px-2">Members</TableHead>
                <TableHead className="text-[11px] px-1 w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="py-1.5 px-2">
                    <p className="text-xs font-medium">{g.name}</p>
                    {g.description && <p className="text-[10px] text-muted-foreground">{g.description}</p>}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-xs">
                    {field === "ta"
                      ? (g.ta_type === "from_gps" ? `GPS × ₹${g.ta_per_km_rate}/km` : `₹${g.fixed_ta_amount}`)
                      : `₹${g.da_amount}`}
                  </TableCell>
                  <TableCell className="py-1.5 px-2">
                    <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => openMembers(g)}>
                      <Users className="h-3 w-3 mr-0.5" />{g.member_count || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1.5 px-1">
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openMembers(g)}><UserPlus className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEdit(g)}><Edit2 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => remove(g)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">Priority: User Override → Group → Team → Global Default</p>

      {/* Group create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Create"} Group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

            {field === "ta" ? (
              <>
                <div className="space-y-1"><Label className="text-xs">TA Type</Label>
                  <Select value={form.ta_type} onValueChange={(v: any) => setForm({ ...form, ta_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                      <SelectItem value="from_gps">From GPS Tracking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.ta_type === "fixed" ? (
                  <div className="space-y-1"><Label className="text-xs">Fixed TA Amount (₹)</Label>
                    <Input type="number" min="0" value={form.fixed_ta_amount}
                      onChange={(e) => setForm({ ...form, fixed_ta_amount: Number(e.target.value) })} /></div>
                ) : (
                  <div className="space-y-1"><Label className="text-xs">Per KM Rate (₹)</Label>
                    <Input type="number" min="0" value={form.ta_per_km_rate}
                      onChange={(e) => setForm({ ...form, ta_per_km_rate: Number(e.target.value) })} /></div>
                )}
              </>
            ) : (
              <div className="space-y-1"><Label className="text-xs">DA Amount (₹)</Label>
                <Input type="number" min="0" value={form.da_amount}
                  onChange={(e) => setForm({ ...form, da_amount: Number(e.target.value) })} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Members · {membersGroup?.name}</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="pl-7 h-8 text-xs" />
          </div>
          <ScrollArea className="h-[280px] border rounded-md">
            <div className="p-2 space-y-0.5">
              {filteredUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs"
                  onClick={() => {
                    setSelectedMembers((prev) => {
                      const next = new Set(prev);
                      if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                      return next;
                    });
                  }}>
                  <Checkbox checked={selectedMembers.has(u.id)} className="h-3.5 w-3.5" />
                  <span className="truncate">{u.full_name || "Unnamed"}</span>
                </div>
              ))}
              {!filteredUsers.length && <p className="text-xs text-center text-muted-foreground py-4">No users.</p>}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersOpen(false)}>Cancel</Button>
            <Button onClick={saveMembers}>Save Members</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
