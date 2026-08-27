import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Eye, EyeOff } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useConfigFieldsWorkflow } from "@/hooks/useConfigFieldsWorkflow";
import { FieldDef } from "@/lib/configSchemas";
import { FieldEditorDialog } from "./FieldEditorDialog";

export function FieldManager({ module }: { module: string }) {
  const { fields, setFields } = useConfigFieldsWorkflow(module);
  const [advanced, setAdvanced] = useState(false);
  const [editing, setEditing] = useState<FieldDef | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FieldDef | null>(null);

  const visible = fields.filter((f) => !f.deleted);

  const patch = (id: string, p: Partial<FieldDef>) =>
    setFields(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));

  const move = (id: string, dir: -1 | 1) => {
    const list = [...visible];
    const i = list.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    // rebuild full list (deleted retained at end)
    const deleted = fields.filter((f) => f.deleted);
    setFields([...list, ...deleted]);
  };

  const upsert = (f: FieldDef) => {
    const idx = fields.findIndex((x) => x.id === f.id);
    if (idx >= 0) {
      const next = [...fields]; next[idx] = f; setFields(next);
    } else {
      setFields([...fields, f]);
    }
  };

  const removeField = (f: FieldDef) => {
    if (f.builtin) {
      patch(f.id, { visible: false });
    } else {
      setFields(fields.filter((x) => x.id !== f.id));
    }
    setConfirmDelete(null);
  };

  const softDelete = (f: FieldDef) => {
    patch(f.id, { deleted: true, visible: false });
    setConfirmDelete(null);
  };

  return (
    <div className="rounded-lg border border-border/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Form fields</p>
          <p className="text-xs text-muted-foreground">Toggle visibility and manage custom fields</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
          {advanced ? "Simple view" : "Manage fields"}
        </Button>
      </div>

      {!advanced && (
        <div className="space-y-2">
          {visible.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate">{f.label}</span>
                {!f.builtin && <Badge variant="outline" className="text-[10px]">custom</Badge>}
              </div>
              <Switch checked={f.visible} onCheckedChange={(v) => patch(f.id, { visible: v })} />
            </div>
          ))}
          {visible.length === 0 && <p className="text-xs text-muted-foreground">No fields configured.</p>}
        </div>
      )}

      {advanced && (
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-[1fr_100px_80px_80px_130px] gap-2 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <div>Field</div><div>Type</div><div>Visible</div><div>Required</div><div className="text-right">Actions</div>
          </div>
          {visible.map((f, i) => (
            <div key={f.id} className="grid grid-cols-1 md:grid-cols-[1fr_100px_80px_80px_130px] gap-2 items-center px-2 py-1.5 rounded-md border bg-background">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{f.label}</div>
                {f.helpText && <div className="text-[11px] text-muted-foreground truncate">{f.helpText}</div>}
                {!f.builtin && <Badge variant="outline" className="text-[10px] mt-0.5">custom</Badge>}
              </div>
              <div className="text-xs capitalize">{f.type}</div>
              <div><Switch checked={f.visible} onCheckedChange={(v) => patch(f.id, { visible: v })} /></div>
              <div><Switch checked={f.required} onCheckedChange={(v) => patch(f.id, { required: v })} /></div>
              <div className="flex items-center justify-end gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(f.id, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === visible.length - 1} onClick={() => move(f.id, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(f); setEditorOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmDelete(f)}>
                  {f.builtin ? (f.visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />) : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                </Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add custom field
          </Button>
        </div>
      )}

      <FieldEditorDialog open={editorOpen} onOpenChange={setEditorOpen} initial={editing} onSave={upsert} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.builtin ? "Hide built-in field?" : `Remove "${confirmDelete?.label}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.builtin
                ? "Built-in fields can't be deleted, but you can hide them from the form."
                : "Existing records that used this field will keep the value in history. You can hard-delete or deactivate (soft-delete) instead."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {confirmDelete && !confirmDelete.builtin && (
              <Button variant="secondary" onClick={() => softDelete(confirmDelete)}>Deactivate</Button>
            )}
            <AlertDialogAction onClick={() => confirmDelete && removeField(confirmDelete)}>
              {confirmDelete?.builtin ? "Hide" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
