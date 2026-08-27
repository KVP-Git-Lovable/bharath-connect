import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldDef, FieldType } from "@/lib/configSchemas";
import { X } from "lucide-react";

const TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "dropdown", label: "Dropdown" },
  { value: "date", label: "Date" },
  { value: "toggle", label: "Toggle (yes/no)" },
  { value: "file", label: "File upload" },
];

export function FieldEditorDialog({
  open, onOpenChange, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: FieldDef | null;
  onSave: (f: FieldDef) => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [defaultValue, setDefaultValue] = useState("");
  const [helpText, setHelpText] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [optDraft, setOptDraft] = useState("");

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? "");
      setType(initial?.type ?? "text");
      setDefaultValue(String(initial?.defaultValue ?? ""));
      setHelpText(initial?.helpText ?? "");
      setOptions(initial?.options ?? []);
      setOptDraft("");
    }
  }, [open, initial]);

  const canSave = label.trim().length > 0 && (type !== "dropdown" || options.length > 0);

  const save = () => {
    const key = initial?.key ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const field: FieldDef = {
      id: initial?.id ?? `custom-${key}-${Date.now()}`,
      key,
      label: label.trim(),
      type,
      visible: initial?.visible ?? true,
      required: initial?.required ?? false,
      builtin: initial?.builtin ?? false,
      deleted: initial?.deleted ?? false,
      defaultValue: defaultValue || undefined,
      helpText: helpText || undefined,
      options: type === "dropdown" ? options : undefined,
      order: initial?.order ?? 999,
    };
    onSave(field);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit field" : "Add custom field"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Field name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Client Reference" />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as FieldType)} disabled={initial?.builtin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {type === "dropdown" && (
            <div className="space-y-1">
              <Label>Options</Label>
              <div className="flex gap-1">
                <Input value={optDraft} onChange={(e) => setOptDraft(e.target.value)}
                  placeholder="Add option and Enter"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && optDraft.trim()) {
                      e.preventDefault();
                      setOptions([...options, optDraft.trim()]); setOptDraft("");
                    }
                  }} />
                <Button type="button" size="sm" variant="secondary" onClick={() => {
                  if (optDraft.trim()) { setOptions([...options, optDraft.trim()]); setOptDraft(""); }
                }}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {options.map((o, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {o}
                    <button type="button" onClick={() => setOptions(options.filter((_, x) => x !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>Default value</Label>
            <Input value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Help text</Label>
            <Textarea rows={2} value={helpText} onChange={(e) => setHelpText(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save field</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
