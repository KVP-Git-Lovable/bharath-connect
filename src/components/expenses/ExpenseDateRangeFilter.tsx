import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ExpenseDatePreset =
  | "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

interface Props {
  preset: ExpenseDatePreset;
  onPresetChange: (p: ExpenseDatePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
  rangeLabel: string;
}

const presetLabels: Record<ExpenseDatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  last_month: "Last Month",
  custom: "Custom Date Range",
};

export default function ExpenseDateRangeFilter({
  preset, onPresetChange, customStart, customEnd, onCustomStartChange, onCustomEndChange, rangeLabel,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 h-8">
            <Filter className="h-3.5 w-3.5" />
            Filter
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="center">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={preset} onValueChange={(v) => onPresetChange(v as ExpenseDatePreset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {preset === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={customStart} onChange={(e) => onCustomStartChange(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={customEnd} onChange={(e) => onCustomEndChange(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Badge className="bg-primary/10 text-primary border border-primary/20 font-normal">
        {presetLabels[preset]}: {rangeLabel}
      </Badge>
    </div>
  );
}
