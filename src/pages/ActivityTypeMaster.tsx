import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Save, ListChecks, Sparkles, Loader2 } from "lucide-react";

interface ActivityTypeRow {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  details: string | null;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export default function ActivityTypeMaster() {
  const [types, setTypes] = useState<ActivityTypeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityTypeRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isElaborating, setIsElaborating] = useState(false);
  const [formData, setFormData] = useState({ name: "", is_active: true, sort_order: 100, details: "" });

  useEffect(() => { fetchTypes(); }, []);

  const fetchTypes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("activity_types_master")
      .select("id, name, is_active, sort_order, details")
      .order("sort_order")
      .order("name");
    if (!error) setTypes((data || []) as ActivityTypeRow[]);
    setIsLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setFormData({ name: "", is_active: true, sort_order: 100, details: "" });
    setIsDialogOpen(true);
  };

  const openEdit = (t: ActivityTypeRow) => {
    setEditing(t);
    setFormData({ name: t.name, is_active: t.is_active, sort_order: t.sort_order, details: t.details || "" });
    setIsDialogOpen(true);
  };

  const handleElaborate = async () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) { toast.error("Enter the activity type name first"); return; }
    setIsElaborating(true);
    try {
      const { data, error } = await supabase.functions.invoke("elaborate-activity-details", {
        body: { name: trimmedName, draft: formData.details },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      if (data?.details) {
        setFormData((prev) => ({ ...prev, details: data.details }));
        toast.success("Details generated");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate details");
    } finally {
      setIsElaborating(false);
    }
  };

  const handleSave = async () => {
    const trimmed = formData.name.trim();
    if (!trimmed) { toast.error("Activity type name is required"); return; }
    if (types.some((t) => t.name.toLowerCase() === trimmed.toLowerCase() && t.id !== editing?.id)) {
      toast.error("This activity type already exists");
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("activity_types_master")
          .update({ name: trimmed, is_active: formData.is_active, sort_order: formData.sort_order, details: formData.details.trim() || null })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Activity type updated");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("activity_types_master")
          .insert({ name: trimmed, is_active: formData.is_active, sort_order: formData.sort_order, details: formData.details.trim() || null, created_by: user?.id });
        if (error) throw error;
        toast.success("Activity type created");
      }
      setIsDialogOpen(false);
      fetchTypes();
    } catch (err: any) {
      toast.error(err.message || "Failed to save activity type");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("activity_types_master").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") toast.error("Cannot delete: type is in use. Disable it instead.");
      else toast.error(error.message || "Failed to delete");
    } else {
      toast.success("Activity type deleted");
      fetchTypes();
    }
    setDeleteConfirmId(null);
  };

  const toggleActive = async (t: ActivityTypeRow) => {
    const { error } = await supabase
      .from("activity_types_master")
      .update({ is_active: !t.is_active })
      .eq("id", t.id);
    if (!error) { toast.success(`Activity type ${t.is_active ? "disabled" : "enabled"}`); fetchTypes(); }
    else toast.error(error.message || "Failed to update");
  };

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">Activity Type Master</h1>
        <p className="text-sm text-muted-foreground">Manage activity types available in the Activities module</p>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" />Activity Types</CardTitle>
                <CardDescription>Only active types appear in the Activities dropdown</CardDescription>
              </div>
              <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Type</Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : types.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><ListChecks className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No activity types configured yet</p></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Order</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-center"><Badge variant="outline">{t.sort_order}</Badge></TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={t.is_active ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] cursor-pointer" : "bg-destructive/20 text-destructive cursor-pointer"}
                          onClick={() => toggleActive(t)}
                        >
                          {t.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(t)}><Edit className="h-4 w-4" /></Button>
                          {deleteConfirmId === t.id ? (
                            <div className="flex gap-1">
                              <Button variant="destructive" size="sm" onClick={() => handleDelete(t.id)}>Confirm</Button>
                              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Activity Type" : "Add Activity Type"}</DialogTitle>
            <DialogDescription>Configure the activity type</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Quality Check" autoFocus />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Activity Details</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleElaborate}
                  disabled={isElaborating || !formData.name.trim()}
                >
                  {isElaborating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  {isElaborating ? "Generating..." : "Elaborate with AI"}
                </Button>
              </div>
              <Textarea
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                placeholder="Describe this activity, or type a few words and let AI elaborate"
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">AI uses the name and any text you've entered to generate details</p>
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input type="number" value={formData.sort_order} onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })} />
              <p className="text-xs text-muted-foreground mt-1">Lower numbers appear first in the dropdown</p>
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Active</Label><p className="text-xs text-muted-foreground">Show this type in the Activities dropdown</p></div>
              <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}><Save className="h-4 w-4 mr-2" />{isSaving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
