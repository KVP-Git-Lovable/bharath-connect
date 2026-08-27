import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";

export interface OverviewMetric {
  name: string;
  /** Normalised numeric value used for the bar height. */
  value: number;
  /** Human-readable label shown in tooltip and on top of the bar. */
  display: string;
  color: string;
}

function MetricTooltip({
  active,
  payload,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
}) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload as OverviewMetric;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{p.name}</p>
      <p className="text-muted-foreground">{p.display}</p>
    </div>
  );
}

export function OverviewSummaryChart({ data }: { data: OverviewMetric[] }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-4 sm:p-6">
        <h3 className="text-lg font-bold">Business Summary</h3>
        <p className="text-sm text-muted-foreground">
          Cross-module snapshot for the selected period (PO value &amp; expenses shown in ₹ thousands)
        </p>
        <div className="mt-4 h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={48} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<MetricTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                <LabelList
                  dataKey="display"
                  position="top"
                  style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                />
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
