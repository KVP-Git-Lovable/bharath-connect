import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { PieChart as PieIcon, BarChart3, EyeOff } from "lucide-react";

export interface UserDatum {
  id: string;
  name: string;
  value: number;
}

const PALETTE = [
  "hsl(262 70% 60%)",
  "hsl(217 80% 58%)",
  "hsl(160 64% 42%)",
  "hsl(35 90% 55%)",
  "hsl(0 75% 60%)",
  "hsl(330 75% 58%)",
  "hsl(220 10% 65%)",
];

type ChartMode = "pie" | "bar" | "hide";

function ShareTooltip({
  active,
  payload,
  total,
  formatValue,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  total: number;
  formatValue: (v: number) => string;
}) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  const name = item?.payload?.name ?? item?.name;
  const value = Number(item?.value ?? 0);
  const share = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{name}</p>
      <p className="text-muted-foreground">Activities: {formatValue(value)}</p>
      <p className="text-muted-foreground">Share: {share}%</p>
    </div>
  );
}

interface Props {
  title: string;
  description: string;
  data: UserDatum[];
  valueLabel: string;
  formatValue?: (v: number) => string;
}

export function SummaryByUserChart({
  title,
  description,
  data,
  valueLabel,
  formatValue = (v) => v.toLocaleString("en-IN"),
}: Props) {
  const [rank, setRank] = useState<"top" | "bottom">("top");
  const [mode, setMode] = useState<ChartMode>("pie");
  const [selected, setSelected] = useState<string | null>(null);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  const ranked = useMemo(() => {
    const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    const slice = rank === "top" ? sorted.slice(0, 5) : sorted.slice(-5).reverse();
    return slice;
  }, [data, rank]);

  const chartData = useMemo(() => {
    if (rank === "top") {
      const top = [...data].sort((a, b) => b.value - a.value).slice(0, 6);
      const rest = total - top.reduce((s, d) => s + d.value, 0);
      const arr = top.map((d) => ({ name: d.name, value: d.value }));
      if (rest > 0) arr.push({ name: "Others", value: rest });
      return arr;
    }
    return ranked.map((d) => ({ name: d.name, value: d.value }));
  }, [data, ranked, rank, total]);

  return (
    <Card className="shadow-card">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              <Button
                size="sm"
                variant={rank === "top" ? "secondary" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => setRank("top")}
              >
                Top 5
              </Button>
              <Button
                size="sm"
                variant={rank === "bottom" ? "secondary" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => setRank("bottom")}
              >
                Bottom 5
              </Button>
            </div>
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              <Button
                size="icon"
                variant={mode === "pie" ? "secondary" : "ghost"}
                className="h-7 w-7"
                onClick={() => setMode("pie")}
                aria-label="Pie chart"
              >
                <PieIcon className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant={mode === "bar" ? "secondary" : "ghost"}
                className="h-7 w-7"
                onClick={() => setMode("bar")}
                aria-label="Bar chart"
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant={mode === "hide" ? "secondary" : "ghost"}
                className="h-7 w-7"
                onClick={() => setMode("hide")}
                aria-label="Hide chart"
              >
                <EyeOff className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {selected && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Filtered by:</span>
            <span className="font-medium">{selected}</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setSelected(null)}>
              Clear
            </Button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          {mode !== "hide" && (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                {mode === "pie" ? (
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      onClick={(d: any) => {
                        const name = d?.name;
                        if (!name || name === "Others") return;
                        setSelected((prev) => (prev === name ? null : name));
                      }}
                    >
                      {chartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={PALETTE[i % PALETTE.length]}
                          cursor={entry.name === "Others" ? "default" : "pointer"}
                          stroke={selected === entry.name ? "hsl(var(--foreground))" : undefined}
                          strokeWidth={selected === entry.name ? 2 : undefined}
                          opacity={selected && selected !== entry.name ? 0.4 : 1}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ShareTooltip total={total} formatValue={formatValue} />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                ) : (
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<ShareTooltip total={total} formatValue={formatValue} />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}


          <div className={mode === "hide" ? "lg:col-span-2" : ""}>
            <h4 className="font-semibold text-sm mb-2">User Summary</h4>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Full Name</TableHead>
                    <TableHead className="text-right">{valueLabel}</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                        No data for the selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ranked
                      .filter((d) => !selected || d.name === selected)
                      .map((d) => {
                        const i = ranked.findIndex((r) => r.id === d.id);
                        return (
                          <TableRow
                            key={d.id}
                            className={`cursor-pointer ${selected === d.name ? "bg-primary/10" : ""}`}
                            onClick={() => setSelected((prev) => (prev === d.name ? null : d.name))}
                          >
                            <TableCell className="flex items-center gap-2 font-medium">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ background: PALETTE[i % PALETTE.length] }}
                              />
                              {d.name}
                            </TableCell>
                            <TableCell className="text-right">{formatValue(d.value)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0"}%
                            </TableCell>
                          </TableRow>
                        );
                      })
                  )}

                  {ranked.length > 0 && (
                    <TableRow className="font-bold bg-muted/40">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{formatValue(total)}</TableCell>
                      <TableCell className="text-right">100%</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
