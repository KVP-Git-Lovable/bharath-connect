import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldPicker } from "./ViewEditorDialog";
import { DEFAULT_VIEW_COLUMNS } from "@/lib/leadFields";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  viewName: string;
  columns: string[];
  onSave: (columns: string[]) => void;
}

export default function FieldsDisplayDialog({ open, onOpenChange, viewName, columns, onSave }: Props) {
  const [cols, setCols] = useState<string[]>(columns);

  useEffect(() => {
    if (open) setCols(columns.length ? columns : DEFAULT_VIEW_COLUMNS);
  }, [open, columns]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select Fields to Display</DialogTitle>
          <DialogDescription>
            Choose the columns shown in "{viewName}". Filters for this standard view are locked.
          </DialogDescription>
        </DialogHeader>
        <FieldPicker columns={cols} onChange={setCols} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              onSave(cols.length ? cols : DEFAULT_VIEW_COLUMNS);
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
