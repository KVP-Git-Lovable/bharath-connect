import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ArrowLeft, Edit } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface UomRow {
  id: string;
  uom_name: string;
  short_code: string;
  sort_order: number;
  is_active: boolean;
}

export default function UomMaster() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["uom-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_uom").select("*").order("sort_order").order("uom_name");
      if (error) throw error;
      return data as UomRow[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UomRow | null>(null);
  const [form, setForm] = useState({ uom_name: "", short_code: "", sort_order: 0, is_active: true });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const openNew = () => {
    setEditing(null);
    setForm({ uom_name: "", short_code: "", sort_order: rows.length + 1, is_active: true });
    setOpen(true);
  };
  const openEdit = (r: UomRow) => {
    setEditing(r);
    setForm({ uom_name: r.uom_name, short_code: r.short_code, sort_order: r.sort_order, is_active: r.is_active });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        uom_name: form.uom_name.trim(),
        short_code: form.short_code.trim(),
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("master_uom").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("master_uom").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["uom-admin"] });
      qc.invalidateQueries({ queryKey: ["uom-master"] });
      setOpen(false);
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = async (id: string) => {
    const { error } = await supabase.from("master_uom").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        // In use — soft-deactivate instead
        const { error: uErr } = await supabase.from("master_uom").update({ is_active: false }).eq("id", id);
        if (uErr) toast.error(uErr.message);
        else toast.success("UOM in use — deactivated instead of deleted");
      } else toast.error(error.message);
    } else {
      toast.success("UOM deleted");
    }
    qc.invalidateQueries({ queryKey: ["uom-admin"] });
    qc.invalidateQueries({ queryKey: ["uom-master"] });
    setConfirmId(null);
  };

  const toggleActive = async (r: UomRow) => {
    const { error } = await supabase.from("master_uom").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`UOM ${r.is_active ? "deactivated" : "activated"}`);
      qc.invalidateQueries({ queryKey: ["uom-admin"] });
      qc.invalidateQueries({ queryKey: ["uom-master"] });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => nav("/master-data")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />Back
      </Button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">UOM Master</h1>
          <p className="text-sm text-muted-foreground">Manage units of measurement used across products and procurement</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add UOM</Button>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Order</TableHead>
            <TableHead>UOM Name</TableHead>
            <TableHead>Short Code</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.sort_order}</TableCell>
                <TableCell className="font-medium">{r.uom_name}</TableCell>
                <TableCell><Badge variant="outline">{r.short_code}</Badge></TableCell>
                <TableCell className="text-center">
                  <Badge
                    className={r.is_active ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] cursor-pointer" : "bg-destructive/20 text-destructive cursor-pointer"}
                    onClick={() => toggleActive(r)}
                  >
                    {r.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Edit className="h-4 w-4" /></Button>
                    {confirmId === r.id ? (
                      <>
                        <Button size="sm" variant="destructive" onClick={() => del(r.id)}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setConfirmId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No UOMs yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit UOM" : "Add UOM"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>UOM Name *</Label>
              <Input value={form.uom_name} onChange={(e) => setForm({ ...form, uom_name: e.target.value })} placeholder="e.g., Kilograms" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Short Code *</Label>
                <Input value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value })} placeholder="e.g., Kg" />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Active</Label><p className="text-xs text-muted-foreground">Inactive UOMs are hidden from dropdowns</p></div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.uom_name.trim() || !form.short_code.trim() || save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
