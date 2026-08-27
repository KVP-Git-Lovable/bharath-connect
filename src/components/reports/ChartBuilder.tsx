import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarChart3, Plus, X } from "lucide-react";
import { ReportChartCard } from "./ReportChartCard";
import type { ChartConfig, ReportColumn } from "./reportTypes";

const TYPES: { value: ChartConfig["type"]; label: string }[] = [
  { value: "bar", label: "Vertical bar" },
  { value: "hbar", label: "Horizontal bar" },
  { value: "pie", label: "Donut / Pie" },
];

export function buildChartData<R>(
  rows: R[],
  columns: ReportColumn<R>[],
  cfg: ChartConfig
): { name: string; value: number }[] {
  const group = columns.find((c) => c.key === cfg.groupBy);
  if (!group) return [];
  const measure = cfg.measure === "count" ? null : columns.find((c) => c.key === cfg.measure);
  const acc = new Map<string, { sum: number; count: number }>();
  rows.forEach((r) => {
    const raw = group.value(r);
    const name = raw === null || raw === undefined || raw === "" ? "—" : String(raw);
    const e = acc.get(name) || { sum: 0, count: 0 };
    e.count += 1;
    if (measure) e.sum += Number(measure.value(r) || 0);
    acc.set(name, e);
  });
  let data = Array.from(acc.entries()).map(([name, e]) => ({
    name,
    value: measure ? (cfg.aggregate === "avg" ? (e.count ? e.sum / e.count : 0) : e.sum) : e.count,
  }));
  data.sort((a, b) => b.value - a.value);
  if (cfg.topN) data = data.slice(0, cfg.topN);
  return data.map((d) => ({ ...d, value: Math.round(d.value * 100) / 100 }));
}

interface Props<R> {
  columns: ReportColumn<R>[];
  rows: R[];
  charts: ChartConfig[];
  onChange: (charts: ChartConfig[]) => void;
}

export function ChartBuilder<R>({ columns, rows, charts, onChange }: Props<R>) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ChartConfig["type"]>("bar");
  const [groupBy, setGroupBy] = useState(columns[0]?.key || "");
  const [measure, setMeasure] = useState("count");

  const numericCols = useMemo(() => columns.filter((c) => c.numeric), [columns]);

  const add = () => {
    if (!groupBy) return;
    const groupLabel = columns.find((c) => c.key === groupBy)?.header || groupBy;
    const measureLabel =
      measure === "count" ? "Count" : columns.find((c) => c.key === measure)?.header || measure;
    onChange([
      ...charts,
      {
        id: `${Date.now()}`,
        title: title.trim() || `${measureLabel} by ${groupLabel}`,
        type,
        groupBy,
        measure,
        aggregate: "sum",
      },
    ]);
    setTitle("");
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4" />
          Charts
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add chart
        </Button>
      </div>

      {charts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {charts.map((c) => (
            <div key={c.id} className="relative">
              <button
                type="button"
                aria-label="Remove chart"
                className="absolute right-2 top-2 z-10 p-1 rounded-md bg-muted hover:bg-muted/70"
                onClick={() => onChange(charts.filter((x) => x.id !== c.id))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <ReportChartCard
                title={c.title}
                type={c.type === "hbar" ? "hbar" : c.type === "pie" ? "pie" : "bar"}
                data={buildChartData(rows, columns, c)}
                height={260}
              />
            </div>
          ))}
        </div>
      )}

      {charts.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No charts yet. Add one to visualise this report — you can add as many as you like.
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add chart</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Title (optional)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-generated if blank" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Chart type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ChartConfig["type"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Group by</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Measure</Label>
              <Select value={measure} onValueChange={setMeasure}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">Record count</SelectItem>
                  {numericCols.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      Sum of {c.header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add}>Add chart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
