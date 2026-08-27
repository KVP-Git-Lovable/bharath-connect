import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";
import {
  useOpportunities, useOppStages, useOppTypes, useUserLookup, useCustomers,
  stageColorClasses,
} from "@/hooks/useCustomers";
import { MobileCardList, MobileCard, Field } from "@/components/ui/mobile-card";
import { formatCurrency, formatCurrencyCompact, sumByCurrency, formatMixedCurrencyTotals } from "@/lib/currency";


import { format, parseISO, startOfMonth } from "date-fns";

const STAGE_HEX: Record<string, string> = {
  blue: "#3b82f6", amber: "#f59e0b", green: "#10b981",
  red: "#ef4444", purple: "#a855f7", gray: "#6b7280",
};
const TYPE_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6"];

export default function Opportunities() {
  const nav = useNavigate();
  const { data: opps = [] } = useOpportunities();
  const { data: stages = [] } = useOppStages();
  const { data: types = [] } = useOppTypes();
  const { data: users = [] } = useUserLookup();
  const { data: customers = [] } = useCustomers();
  const customersMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);


  const usersMap = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])),
    [users]
  );
  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);

  const kpis = useMemo(() => {
    const total = opps.length;
    const open = opps.filter((o) => !stageMap[o.stage ?? ""]?.is_closed);
    const won = opps.filter((o) => stageMap[o.stage ?? ""]?.is_won);
    const closed = opps.filter((o) => stageMap[o.stage ?? ""]?.is_closed);
    const openGroups = sumByCurrency(open, (o) => Number(o.amount || 0), (o) => (o as any).currency);
    const wonGroups = sumByCurrency(won, (o) => Number(o.amount || 0), (o) => (o as any).currency);
    const avgGroups = sumByCurrency(opps, (o) => Number(o.amount || 0), (o) => (o as any).currency)
      .map((g) => ({ code: g.code, total: total ? g.total / total : 0 }));
    const winRate = closed.length ? (won.length / closed.length) * 100 : 0;
    return { total, openGroups, wonGroups, avgGroups, winRate };
  }, [opps, stageMap]);

  const byStage = useMemo(() => {
    const map = new Map<string, number>();
    opps.forEach((o) => {
      const k = o.stage || "Unassigned";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map, ([name, value]) => ({
      name, value, color: STAGE_HEX[stageMap[name]?.color ?? "gray"] || STAGE_HEX.gray,
    }));
  }, [opps, stageMap]);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    opps.forEach((o) => {
      const k = o.type || "Unassigned";
      map.set(k, (map.get(k) || 0) + Number(o.amount || 0));
    });
    return Array.from(map, ([name, value], i) => ({
      name, value, color: TYPE_COLORS[i % TYPE_COLORS.length],
    }));
  }, [opps]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    opps.forEach((o) => {
      if (!o.close_date) return;
      const key = format(startOfMonth(parseISO(o.close_date)), "yyyy-MM");
      const cur = map.get(key) || { count: 0, value: 0 };
      map.set(key, { count: cur.count + 1, value: cur.value + Number(o.amount || 0) });
    });
    return Array.from(map, ([k, v]) => ({
      month: format(parseISO(k + "-01"), "MMM yy"),
      key: k, count: v.count, value: v.value,
    })).sort((a, b) => a.key.localeCompare(b.key));
  }, [opps]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Opportunities Insights</h1>
        <p className="text-sm text-muted-foreground">
          Pipeline analytics across all customers. Manage individual opportunities from Customers &rsaquo; Opportunities.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total Opportunities" value={kpis.total.toString()} />
        <Kpi label="Open Pipeline Value" value={formatMixedCurrencyTotals(kpis.openGroups)} />
        <Kpi label="Won Value" value={formatMixedCurrencyTotals(kpis.wonGroups)} />
        <Kpi label="Win Rate" value={`${kpis.winRate.toFixed(1)}%`} />
        <Kpi label="Avg Deal Size" value={formatMixedCurrencyTotals(kpis.avgGroups)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-4">
          <h3 className="font-semibold mb-2">By Stage</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byStage} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                  {byStage.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <h3 className="font-semibold mb-2">Pipeline Value by Type</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byType}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
                <Tooltip formatter={(v: number) => v.toLocaleString()} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {byType.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent></Card>
      </div>

      <Card><CardContent className="p-4">
        <h3 className="font-semibold mb-2">Closing by Month</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
              <Tooltip formatter={(v: number, k: string) => k === "value" ? v.toLocaleString() : v} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="count" stroke="#6366f1" name="Opportunities" />
              <Line yAxisId="right" type="monotone" dataKey="value" stroke="#10b981" name="Value" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent></Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <h3 className="font-semibold">All Opportunities</h3>
            <p className="text-xs text-muted-foreground">Tap a row/card to open details</p>
          </div>

          {/* Desktop / tablet table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Customer / Account</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Close Date</TableHead><TableHead>Owner</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {opps.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => nav(`/opportunities/${o.id}`)}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell>
                      {o.customer_id ? (
                        <button
                          className="text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); nav(`/customers/${o.customer_id}`); }}
                        >
                          {customersMap[o.customer_id] ?? "—"}
                        </button>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={stageColorClasses(stageMap[o.stage ?? ""]?.color)}>{o.stage || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(o.amount), (o as any).currency)}</TableCell>
                    <TableCell>{o.close_date ? format(parseISO(o.close_date), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell>{o.owner_id ? usersMap[o.owner_id] ?? "—" : "—"}</TableCell>
                  </TableRow>
                ))}
                {opps.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No opportunities.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <MobileCardList className="md:hidden p-3">
            {opps.map((o) => (
              <MobileCard
                key={o.id}
                onClick={() => nav(`/opportunities/${o.id}`)}
                title={o.name}
                badge={<Badge className={stageColorClasses(stageMap[o.stage ?? ""]?.color)}>{o.stage || "—"}</Badge>}
              >
                <Field
                  label="Customer"
                  full
                  value={
                    o.customer_id ? (
                      <button
                        className="text-primary underline underline-offset-2"
                        onClick={(e) => { e.stopPropagation(); nav(`/customers/${o.customer_id}`); }}
                      >
                        {customersMap[o.customer_id] ?? "—"}
                      </button>
                    ) : "—"
                  }
                />
                <Field label="Amount" value={formatCurrency(Number(o.amount), (o as any).currency)} />
                <Field label="Close Date" value={o.close_date ? format(parseISO(o.close_date), "dd MMM yyyy") : "—"} />
                <Field label="Owner" full value={o.owner_id ? usersMap[o.owner_id] ?? "—" : "—"} />
              </MobileCard>
            ))}
            {opps.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">No opportunities.</p>
            )}
          </MobileCardList>
        </CardContent>
      </Card>
    </div>

  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </CardContent></Card>
  );
}
