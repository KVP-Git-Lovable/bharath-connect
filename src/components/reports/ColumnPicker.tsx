import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Columns3 } from "lucide-react";
import type { ReportColumn } from "./reportTypes";

interface Props<R> {
  columns: ReportColumn<R>[];
  visible: string[];
  onChange: (keys: string[]) => void;
}

export function ColumnPicker<R>({ columns, visible, onChange }: Props<R>) {
  const toggle = (key: string) => {
    const next = visible.includes(key)
      ? visible.filter((k) => k !== key)
      : columns.filter((c) => visible.includes(c.key) || c.key === key).map((c) => c.key);
    if (!next.length) return;
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="h-3.5 w-3.5" />
          Fields ({visible.length}/{columns.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 bg-popover z-50">
        <p className="text-xs font-semibold mb-2">Fields to display</p>
        <div className="max-h-72 overflow-auto space-y-2 pr-1">
          {columns.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={visible.includes(c.key)} onCheckedChange={() => toggle(c.key)} />
              {c.header}
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => onChange(columns.map((c) => c.key))}>
            Select all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() => onChange(columns.filter((c) => !c.defaultHidden).map((c) => c.key))}
          >
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
