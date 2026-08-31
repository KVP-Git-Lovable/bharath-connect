import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  computeChartData,
  fieldDef,
  LEAD_FIELDS,
  type AggregateType,
  type ChartType,
  type ViewChart,
} from "@/lib/leadFields";

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "vertical_bar", label: "Vertical Bar Chart" },
  { value: "horizontal_bar", label: "Horizontal Bar Chart" },
  { value: "donut", label: "Donut Chart" },
  { value: "line", label: "Line Chart" },
];

const AGGREGATES: { value: AggregateType; label: string }[] = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
];

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 197 37% 44%))",
  "hsl(var(--chart-4, 43 74% 56%))",
  "hsl(var(--chart-5, 27 87% 61%))",
];

const numericFields = LEAD_FIELDS.filter((f) => f.type === "number");
const groupFields = LEAD_FIELDS.filter((f) => f.type !== "number" || true);

const newChart = (): ViewChart => ({
  id: crypto.randomUUID(),
  name: "Leads by status",
  chart_type: "vertical_bar",
  aggregate: "count",
  aggregate_field: null,
  group_field: "status_name",
  limit: 12,
});

function ChartEditor({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: ViewChart | null;
  onSave: (c: ViewChart) => void;
}) {
  const [draft, setDraft] = useState<ViewChart>(value ?? newChart());

  useEffect(() => {
    if (open) setDraft(value ?? newChart());
  }, [open, value]);

  const set = (patch: Partial<ViewChart>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{value ? "Edit Chart" : "New Chart"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Chart Name</Label>
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Chart name" />
          </div>
          <div className="space-y-1.5">
            <Label>Chart Type</Label>
            <Select value={draft.chart_type} onValueChange={(v) => set({ chart_type: v as ChartType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {CHART_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Aggregate Type</Label>
            <Select
              value={draft.aggregate}
              onValueChange={(v) =>
                set({
                  aggregate: v as AggregateType,
                  aggregate_field: v === "count" ? null : draft.aggregate_field ?? numericFields[0]?.key ?? null,
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {AGGREGATES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {draft.aggregate !== "count" && (
            <div className="space-y-1.5">
              <Label>Aggregate Field</Label>
              <Select value={draft.aggregate_field ?? ""} onValueChange={(v) => set({ aggregate_field: v })}>
                <SelectTrigger><SelectValue placeholder="Select a number field" /></SelectTrigger>
                <SelectContent className="bg-popover z-50 max-h-64">
                  {numericFields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Grouping Field</Label>
            <Select value={draft.group_field} onValueChange={(v) => set({ group_field: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50 max-h-64">
                {groupFields.map((f) => (
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
              if (!draft.name.trim()) return;
              if (draft.aggregate !== "count" && !draft.aggregate_field) return;
              onSave(draft);
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

interface Props {
  charts: ViewChart[];
  rows: any[];
  canManage: boolean;
  onChange: (charts: ViewChart[]) => void;
  onClose: () => void;
}

export default function ViewChartsPanel({ charts, rows, canManage, onChange, onClose }: Props) {
  const [activeId, setActiveId] = useState<string | null>(charts[0]?.id ?? null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ViewChart | null>(null);

  useEffect(() => {
    if (!charts.some((c) => c.id === activeId)) setActiveId(charts[0]?.id ?? null);
  }, [charts, activeId]);

  const chart = charts.find((c) => c.id === activeId) ?? null;
  const data = useMemo(() => (chart ? computeChartData(rows, chart) : []), [rows, chart]);

  const metricLabel = chart
    ? chart.aggregate === "count"
      ? "Record Count"
      : `${chart.aggregate === "sum" ? "Sum" : "Avg"} of ${fieldDef(chart.aggregate_field || "")?.label ?? ""}`
    : "";

  const upsert = (c: ViewChart) => {
    const exists = charts.some((x) => x.id === c.id);
    onChange(exists ? charts.map((x) => (x.id === c.id ? c : x)) : [...charts, c]);
    setActiveId(c.id);
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card shadow-sm p-4 space-y-3 overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-base font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" />
          Charts
        </div>
        <div className="flex items-center gap-1">
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Chart options">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-popover z-50">
                <DropdownMenuLabel className="text-xs">Display As</DropdownMenuLabel>
                {CHART_TYPES.map((t) => (
                  <DropdownMenuItem
                    key={t.value}
                    disabled={!chart}
                    onClick={() => chart && upsert({ ...chart, chart_type: t.value })}
                  >
                    {t.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setEditing(null); setEditorOpen(true); }} className="gap-2">
                  <Plus className="h-3.5 w-3.5" /> New Chart
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!chart} onClick={() => { setEditing(chart); setEditorOpen(true); }} className="gap-2">
                  <Pencil className="h-3.5 w-3.5" /> Edit Chart
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!chart}
                  className="gap-2 text-destructive"
                  onClick={() => chart && onChange(charts.filter((c) => c.id !== chart.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Chart
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close charts">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {charts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
          <p>No charts on this view yet.</p>
          {canManage && (
            <Button size="sm" className="gap-2" onClick={() => { setEditing(null); setEditorOpen(true); }}>
              <Plus className="h-4 w-4" /> New Chart
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Select Chart</Label>
            <Select value={activeId ?? ""} onValueChange={setActiveId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {charts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chart?.chart_type === "donut" ? (
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {data.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              ) : chart?.chart_type === "line" ? (
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" name={metricLabel} stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              ) : chart?.chart_type === "horizontal_bar" ? (
                <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name={metricLabel} fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name={metricLabel} fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {metricLabel} by {fieldDef(chart?.group_field || "")?.label ?? ""}
          </p>

          <div className="divide-y divide-border rounded-lg border border-border">
            {data.map((d: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate">{d.name}</span>
                <span className="font-semibold tabular-nums">
                  {typeof d.value === "number" ? Math.round(d.value * 100) / 100 : d.value}
                </span>
              </div>
            ))}
            {data.length > 0 && (
              <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {Math.round(data.reduce((s: number, d: any) => s + (Number(d.value) || 0), 0) * 100) / 100}
                </span>
              </div>
            )}
          </div>

          {canManage && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => { setEditing(null); setEditorOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
              <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled={!chart} onClick={() => { setEditing(chart); setEditorOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </div>
          )}
        </>

      )}

      <ChartEditor open={editorOpen} onOpenChange={setEditorOpen} value={editing} onSave={upsert} />
    </div>
  );
}
