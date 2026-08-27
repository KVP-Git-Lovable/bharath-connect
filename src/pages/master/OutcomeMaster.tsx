import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function OutcomeMaster() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["activity-outcomes-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_activity_outcomes" as any).select("*").order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", sort_order: 0, is_active: true });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", sort_order: rows.length + 1, is_active: true });
    setOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ name: r.name, sort_order: r.sort_order, is_active: r.is_active });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    try {
      if (editing) {
        const { error } = await supabase.from("master_activity_outcomes" as any).update(form).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("master_activity_outcomes" as any).insert(form);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["activity-outcomes-admin"] });
      qc.invalidateQueries({ queryKey: ["activity-outcomes"] });
      setOpen(false);
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("master_activity_outcomes" as any).delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        await supabase.from("master_activity_outcomes" as any).update({ is_active: false }).eq("id", id);
        toast.success("In use — deactivated instead");
      } else return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["activity-outcomes-admin"] });
    qc.invalidateQueries({ queryKey: ["activity-outcomes"] });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => nav("/master-data")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Activity Outcomes</h1>
        <p className="text-sm text-muted-foreground">Manage activity outcome types (Productive, Not started, etc.)</p>
      </div>

      <Button onClick={openNew} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Outcome
      </Button>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.sort_order}</TableCell>
                  <TableCell>
                    {r.is_active ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-600">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => del(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Outcome" : "New Outcome"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Productive"
              />
            </div>
            <div>
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input
                id="sort_order"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
