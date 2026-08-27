import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { BookmarkPlus, ChevronDown, Pin, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { useSavedReports } from "@/hooks/useSavedReports";
import type { SavedReport, SavedReportConfig } from "./reportTypes";

interface Props {
  module: string;
  currentConfig: SavedReportConfig;
  activeId: string | null;
  activeName: string | null;
  onApply: (report: SavedReport) => void;
  onSaved: (id: string, name: string) => void;
  onCleared: () => void;
}

export function SavedReportBar({
  module,
  currentConfig,
  activeId,
  activeName,
  onApply,
  onSaved,
  onCleared,
}: Props) {
  const { reports, save, remove, setFavourite } = useSavedReports(module);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const doSave = async (asNew: boolean) => {
    const finalName = asNew ? name.trim() : activeName || name.trim();
    if (!finalName) {
      toast.error("Give the report a name");
      return;
    }
    try {
      const id = await save.mutateAsync({
        id: asNew ? undefined : activeId || undefined,
        name: finalName,
        config: currentConfig,
      });
      onSaved(id, finalName);
      setOpen(false);
      setName("");
      toast.success(asNew ? "Report saved" : "Report updated");
    } catch {
      toast.error("Could not save the report");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            {activeName || "Saved reports"}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 bg-popover z-50">
          <DropdownMenuLabel>My saved reports</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {reports.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No saved reports yet. Configure the filters, columns and charts, then save.
            </div>
          )}
          {reports.map((r) => (
            <DropdownMenuItem
              key={r.id}
              onSelect={(e) => {
                e.preventDefault();
                onApply(r);
              }}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate flex items-center gap-1.5">
                {r.is_favourite && <Pin className="h-3 w-3 text-primary fill-current" />}
                {r.name}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={r.is_favourite ? "Unpin report" : "Pin report"}
                  title={r.is_favourite ? "Unpin report" : "Pin as default"}
                  className="p-1 rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFavourite.mutate({ id: r.id, value: !r.is_favourite });
                  }}
                >
                  <Pin className={`h-3.5 w-3.5 ${r.is_favourite ? "text-primary fill-current" : ""}`} />
                </button>
                <button
                  type="button"
                  aria-label="Delete report"
                  className="p-1 rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(r.id, {
                      onSuccess: () => {
                        if (activeId === r.id) onCleared();
                        toast.success("Report deleted");
                      },
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {activeId && (
        <>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => doSave(false)}>
            <Save className="h-3.5 w-3.5" />
            Update
          </Button>
          <Badge variant="secondary" className="text-[11px]">
            Editing saved view
          </Badge>
        </>
      )}

      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <BookmarkPlus className="h-3.5 w-3.5" />
        Save as
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save report</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Report name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Q1 pipeline" />
            <p className="text-[11px] text-muted-foreground">
              Saves the current filters, selected columns and charts.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => doSave(true)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
