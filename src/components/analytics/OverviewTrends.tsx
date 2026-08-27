import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Activity, CalendarCheck, ShoppingCart, Receipt } from "lucide-react";
import { ReportScope } from "@/components/reports/useReportScope";

interface Props {
  from: string;
  to: string;
  scope: ReportScope;
}

function scopeFilter(scope: ReportScope) {
  if (scope.isAdmin || !scope.userIds) return null;
  return scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"];
}

interface WeekPoint {
  week: string;
  value: number;
}

function buildWeeks<T>(rows: T[], dateOf: (r: T) => string, valueOf: (r: T) => number): WeekPoint[] {
  const m = new Map<string, { key: string; label: string; value: number }>();
  rows.forEach((r) => {
    const d = new Date(dateOf(r));
    const start = startOfWeek(d, { weekStartsOn: 1 });
    const key = format(start, "yyyy-MM-dd");
    const e = m.get(key) || { key, label: format(start, "dd MMM"), value: 0 };
    e.value += valueOf(r);
    m.set(key, e);
  });
  return Array.from(m.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((e) => ({ week: e.label, value: e.value }));
}

interface CardSpec {
  label: string;
  icon: typeof Activity;
  color: string;
  total: string;
  data: WeekPoint[];
  fmt: (v: number) => string;
}

function TrendCard({ spec }: { spec: CardSpec }) {
  const Icon = spec.icon;
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4" style={{ color: spec.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">{spec.label}</p>
            <p className="text-lg font-bold leading-tight">{spec.total}</p>
          </div>
        </div>
        <div className="h-[64px] mt-2 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spec.data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${spec.label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={spec.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={spec.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" hide />
              <Tooltip
                cursor={{ stroke: spec.color, strokeWidth: 1, opacity: 0.4 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as WeekPoint;
                  return (
                    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
                      <p className="font-semibold">{p.week}</p>
                      <p className="text-muted-foreground">{spec.fmt(p.value)}</p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={spec.color}
                strokeWidth={2}
                fill={`url(#grad-${spec.label})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewTrends({ from, to, scope }: Props) {
  const ids = scopeFilter(scope);

  const { data } = useQuery({
    queryKey: ["overview-trends", from, to, ids],
    enabled: !scope.loading,
    queryFn: async () => {
      const apply = (q: any) => (ids ? q.in("user_id", ids) : q);

      const [{ data: acts }, { data: att }, { data: pos }, { data: exps }] = await Promise.all([
        apply(
          supabase.from("activity_events").select("activity_date").gte("activity_date", from).lte("activity_date", to)
        ),
        apply(
          supabase
            .from("attendance")
            .select("date")
            .in("status", ["present", "regularized"])
            .gte("date", from)
            .lte("date", to)
        ),
        supabase.from("procurement_orders").select("order_date, total_amount").gte("order_date", from).lte("order_date", to),
        apply(
          supabase.from("additional_expenses").select("expense_date, amount").gte("expense_date", from).lte("expense_date", to)
        ),
      ]);

      return {
        activities: buildWeeks(acts || [], (r: any) => r.activity_date, () => 1),
        attendance: buildWeeks(att || [], (r: any) => r.date, () => 1),
        poValue: buildWeeks(pos || [], (r: any) => r.order_date, (r: any) => Number(r.total_amount) || 0),
        expenses: buildWeeks(exps || [], (r: any) => r.expense_date, (r: any) => Number(r.amount) || 0),
      };
    },
  });

  const k = (n: number) => `₹${(n / 1000).toFixed(n >= 1000 ? 0 : 1)}K`;
  const num = (n: number) => n.toLocaleString("en-IN");

  const specs: CardSpec[] = useMemo(() => {
    const sum = (a: WeekPoint[]) => a.reduce((s, p) => s + p.value, 0);
    return [
      {
        label: "Activities",
        icon: Activity,
        color: "hsl(262 70% 60%)",
        data: data?.activities || [],
        total: num(sum(data?.activities || [])),
        fmt: (v: number) => `${num(v)} activities`,
      },
      {
        label: "Present Days",
        icon: CalendarCheck,
        color: "hsl(160 64% 42%)",
        data: data?.attendance || [],
        total: num(sum(data?.attendance || [])),
        fmt: (v: number) => `${num(v)} days`,
      },
      {
        label: "PO Value",
        icon: ShoppingCart,
        color: "hsl(35 90% 55%)",
        data: data?.poValue || [],
        total: k(sum(data?.poValue || [])),
        fmt: k,
      },
      {
        label: "Expenses",
        icon: Receipt,
        color: "hsl(0 75% 60%)",
        data: data?.expenses || [],
        total: k(sum(data?.expenses || [])),
        fmt: k,
      },
    ];
  }, [data]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {specs.map((s) => (
        <TrendCard key={s.label} spec={s} />
      ))}
    </div>
  );
}
