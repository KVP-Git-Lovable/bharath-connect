import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KANBAN_GROUP_FIELDS, KANBAN_SUMMARY_FIELDS, type KanbanConfig } from "@/lib/leadFields";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: KanbanConfig;
  onSave: (config: KanbanConfig) => void;
}

const NONE = "__none__";

export default function KanbanSettingsDialog({ open, onOpenChange, config, onSave }: Props) {
  const [groupField, setGroupField] = useState(config.group_field || "status_name");
  const [summarize, setSummarize] = useState(config.summarize_field || NONE);

  useEffect(() => {
    if (!open) return;
    setGroupField(config.group_field || "status_name");
    setSummarize(config.summarize_field || NONE);
  }, [open, config]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kanban Settings</DialogTitle>
          <DialogDescription>Choose what to summarise and how cards are grouped.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summarize By</Label>
            <Select value={summarize} onValueChange={setSummarize}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue placeholder="-- None --" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value={NONE}>-- None --</SelectItem>
                {KANBAN_SUMMARY_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="text-destructive">*</span> Group By
            </Label>
            <Select value={groupField} onValueChange={setGroupField}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {KANBAN_GROUP_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              onSave({ group_field: groupField, summarize_field: summarize === NONE ? null : summarize });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
