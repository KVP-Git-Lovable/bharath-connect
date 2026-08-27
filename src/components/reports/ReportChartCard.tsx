import { Card, CardContent } from "@/components/ui/card";
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
  CartesianGrid,
} from "recharts";

export const CHART_PALETTE = [
  "hsl(262 70% 60%)",
  "hsl(217 80% 58%)",
  "hsl(160 64% 42%)",
  "hsl(35 90% 55%)",
  "hsl(0 75% 60%)",
  "hsl(330 75% 58%)",
  "hsl(190 70% 45%)",
  "hsl(220 10% 65%)",
];

export interface ChartDatum {
  name: string;
  [key: string]: string | number;
}

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
}

type ChartType = "bar" | "pie" | "hbar" | "groupedBar";

interface Props {
  title: string;
  description?: string;
  type: ChartType;
  data: ChartDatum[];
  series?: ChartSeries[];
  valueKey?: string;
  formatValue?: (v: number) => string;
  height?: number;
}

export function ReportChartCard({
  title,
  description,
  type,
  data,
  series,
  valueKey = "value",
  formatValue = (v) => v.toLocaleString("en-IN"),
  height = 300,
}: Props) {
  const hasData = data.length > 0;

  const renderChart = () => {
    if (type === "pie") {
      return (
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey="name" cx="50%" cy="50%" outerRadius={Math.min(110, height / 2.6)}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatValue(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      );
    }

    if (type === "hbar") {
      return (
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
          <Tooltip formatter={(v: number) => formatValue(v)} />
          <Bar dataKey={valueKey} radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      );
    }

    if (type === "groupedBar" && series) {
      return (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => formatValue(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              radius={[4, 4, 0, 0]}
              fill={s.color || CHART_PALETTE[i % CHART_PALETTE.length]}
            />
          ))}
        </BarChart>
      );
    }

    // default: single bar
    return (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => formatValue(v)} />
        <Bar dataKey={valueKey} radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    );
  };

  return (
    <Card className="shadow-card">
      <CardContent className="p-4 sm:p-6">
        <h3 className="text-base font-bold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4" style={{ height }}>
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              {renderChart()}
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No data to chart for the selected filters.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
