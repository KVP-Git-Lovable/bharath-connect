import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function EventTypesMaster() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["event-types-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_event_types" as any).select("*").order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", sort_order: 0, is_active: true });

  const openNew = () => { setEditing(null); setForm({ name: "", sort_order: rows.length + 1, is_active: true }); setOpen(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ name: r.name, sort_order: r.sort_order, is_active: r.is_active }); setOpen(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    try {
      if (editing) {
        const { error } = await supabase.from("master_event_types" as any).update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("master_event_types" as any).insert(form);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["event-types-admin"] });
      qc.invalidateQueries({ queryKey: ["event-types"] });
      setOpen(false);
      toast.success("Saved");
    } catch (e: any) { toast.error(e.message); }
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("master_event_types" as any).delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        await supabase.from("master_event_types" as any).update({ is_active: false }).eq("id", id);
        toast.success("In use — deactivated instead");
      } else return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["event-types-admin"] });
    qc.invalidateQueries({ queryKey: ["event-types"] });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => nav("/master-data")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />Back
      </Button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Event Types</h1>
          <p className="text-sm text-muted-foreground">Manage event categories used in Leads & Events</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add Type</Button>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Name</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => openEdit(r)}>
                <TableCell>{r.sort_order}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.is_active ? "Yes" : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); del(r.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Type" : "Add Type"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
