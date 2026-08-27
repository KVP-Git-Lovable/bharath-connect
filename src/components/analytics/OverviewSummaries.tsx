import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportChartCard } from "@/components/reports/ReportChartCard";
import { ReportScope } from "@/components/reports/useReportScope";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dt = (x: string | null) => (x ? format(new Date(x), "dd MMM yyyy") : "--");

interface SectionProps {
  from: string;
  to: string;
  scope: ReportScope;
}

function scopeFilter(scope: ReportScope) {
  if (scope.isAdmin || !scope.userIds) return null;
  return scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"];
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-0 overflow-auto">{children}</CardContent>
    </Card>
  );
}

/* ---------------- Attendance ---------------- */
function AttendanceSummary({ from, to, scope }: SectionProps) {
  const ids = scopeFilter(scope);
  const { data } = useQuery({
    queryKey: ["ov-attendance", from, to, ids],
    enabled: !scope.loading,
    queryFn: async () => {
      let q = supabase
        .from("attendance")
        .select("user_id, date, status, total_hours")
        .gte("date", from)
        .lte("date", to);
      if (ids) q = q.in("user_id", ids);
      const { data } = await q;
      return data || [];
    },
  });

  const nameMap = useMemo(() => new Map(scope.users.map((u) => [u.id, u.full_name])), [scope.users]);

  const chartData = useMemo(() => {
    const weeks = new Map<string, { name: string; Present: number; Absent: number }>();
    (data || []).forEach((r) => {
      const wk = format(startOfWeek(new Date(r.date), { weekStartsOn: 1 }), "dd MMM");
      const e = weeks.get(wk) || { name: wk, Present: 0, Absent: 0 };
      if (r.status === "present" || r.status === "regularized" || r.status === "late") e.Present += 1;
      else if (r.status === "absent") e.Absent += 1;
      weeks.set(wk, e);
    });
    return Array.from(weeks.values());
  }, [data]);

  const tableRows = useMemo(() => {
    const m = new Map<string, { present: number; absent: number; hours: number; hoursN: number; late: number }>();
    (data || []).forEach((r) => {
      const e = m.get(r.user_id) || { present: 0, absent: 0, hours: 0, hoursN: 0, late: 0 };
      if (r.status === "present" || r.status === "regularized" || r.status === "late") e.present += 1;
      else if (r.status === "absent") e.absent += 1;
      if (r.status === "late") e.late += 1;
      if (r.total_hours != null) {
        e.hours += Number(r.total_hours);
        e.hoursN += 1;
      }
      m.set(r.user_id, e);
    });
    return Array.from(m.entries()).map(([id, e]) => ({
      name: nameMap.get(id) || "Unknown",
      present: e.present,
      absent: e.absent,
      avg: e.hoursN ? (e.hours / e.hoursN).toFixed(2) : "--",
      late: e.late,
    }));
  }, [data, nameMap]);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Attendance Summary</h2>
      <ReportChartCard
        title="Present vs Absent per Week"
        type="groupedBar"
        data={chartData}
        series={[
          { key: "Present", label: "Present", color: "hsl(160 64% 42%)" },
          { key: "Absent", label: "Absent", color: "hsl(0 75% 60%)" },
        ]}
      />
      <SectionCard title="Attendance">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Total Present Days</TableHead>
              <TableHead className="text-right">Total Absent Days</TableHead>
              <TableHead className="text-right">Average Hours</TableHead>
              <TableHead className="text-right">Late Check-ins</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No data.</TableCell></TableRow>
            ) : (
              tableRows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.present}</TableCell>
                  <TableCell className="text-right">{r.absent}</TableCell>
                  <TableCell className="text-right">{r.avg}</TableCell>
                  <TableCell className="text-right">{r.late}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

/* ---------------- Procurement ---------------- */
function ProcurementSummary({ from, to }: SectionProps) {
  const { data } = useQuery({
    queryKey: ["ov-procurement", from, to],
    queryFn: async () => {
      const [{ data: sites }, { data: vendors }] = await Promise.all([
        supabase.from("project_sites").select("id, site_name"),
        supabase.from("vendors").select("id, name"),
      ]);
      const siteMap = new Map((sites || []).map((s) => [s.id, s.site_name]));
      const vendorMap = new Map((vendors || []).map((v) => [v.id, v.name]));

      const { data: orders } = await supabase
        .from("procurement_orders")
        .select("id, po_number, vendor_id, site_id, status, total_amount")
        .gte("order_date", from)
        .lte("order_date", to)
        .order("order_date", { ascending: false });

      const poIds = (orders || []).map((o) => o.id);
      const paidByPo = new Map<string, number>();
      if (poIds.length) {
        const { data: invoices } = await supabase
          .from("procurement_invoices")
          .select("id, po_id")
          .in("po_id", poIds);
        const invToPo = new Map((invoices || []).map((i) => [i.id, i.po_id]));
        const invIds = (invoices || []).map((i) => i.id);
        if (invIds.length) {
          const { data: payments } = await supabase
            .from("procurement_invoice_payments")
            .select("invoice_id, amount")
            .in("invoice_id", invIds);
          (payments || []).forEach((p) => {
            const po = invToPo.get(p.invoice_id);
            if (po) paidByPo.set(po, (paidByPo.get(po) || 0) + Number(p.amount || 0));
          });
        }
      }

      return (orders || []).map((o) => {
        const value = Number(o.total_amount || 0);
        const paid = paidByPo.get(o.id) || 0;
        const ps = paid <= 0 ? "Unpaid" : paid >= value && value > 0 ? "Paid" : "Partial";
        return {
          id: o.id,
          po_number: o.po_number || "—",
          vendor: o.vendor_id ? vendorMap.get(o.vendor_id) || "-" : "-",
          site: o.site_id ? siteMap.get(o.site_id) || "-" : "-",
          value,
          paid,
          status: o.status,
          payment_status: ps,
        };
      });
    },
  });

  const rows = data || [];
  const chartData = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.site, (m.get(r.site) || 0) + r.value));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Procurement Summary</h2>
      <ReportChartCard title="PO Value by Site" type="bar" data={chartData} formatValue={inr} />
      <SectionCard title="Procurement">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Site</TableHead>
              <TableHead className="text-right">PO Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No data.</TableCell></TableRow>
            ) : (
              <>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.po_number}</TableCell>
                    <TableCell>{r.vendor}</TableCell>
                    <TableCell>{r.site}</TableCell>
                    <TableCell className="text-right">{inr(r.value)}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell>{r.payment_status}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-muted/40">
                  <TableCell colSpan={3}>Total PO Value: {inr(totalValue)}</TableCell>
                  <TableCell className="text-right">{inr(totalValue)}</TableCell>
                  <TableCell colSpan={2}>Paid: {inr(totalPaid)} • Balance Due: {inr(Math.max(0, totalValue - totalPaid))}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

/* ---------------- Milestone ---------------- */
function MilestoneSummary() {
  const { data } = useQuery({
    queryKey: ["ov-milestones"],
    queryFn: async () => {
      const { data: sites } = await supabase.from("project_sites").select("id, site_name");
      const siteMap = new Map((sites || []).map((s) => [s.id, s.site_name]));
      const { data } = await supabase
        .from("site_milestones")
        .select("id, site_id, name, start_date, end_date, actual_start_date, actual_end_date, percent_complete, status")
        .order("start_date", { ascending: true });
      const today = format(new Date(), "yyyy-MM-dd");
      return (data || []).map((m) => {
        const completed = m.status === "completed";
        const delayed =
          (!!m.end_date && !completed && m.end_date < today) ||
          (!!m.end_date && !!m.actual_end_date && m.actual_end_date > m.end_date);
        return {
          id: m.id,
          site: m.site_id ? siteMap.get(m.site_id) || "-" : "-",
          name: m.name,
          start_date: m.start_date,
          end_date: m.end_date,
          actual_start_date: m.actual_start_date,
          actual_end_date: m.actual_end_date,
          percent: Number(m.percent_complete || 0),
          status: m.status,
          delayed,
        };
      });
    },
  });

  const rows = data || [];
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        name: r.name.length > 22 ? `${r.name.slice(0, 22)}…` : r.name,
        value: r.percent,
      })),
    [rows]
  );

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Milestone Summary</h2>
      <ReportChartCard
        title="Milestone Completion"
        type="hbar"
        data={chartData}
        height={Math.max(260, chartData.length * 32)}
        formatValue={(v) => `${v}%`}
      />
      <SectionCard title="Milestones">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Milestone</TableHead>
              <TableHead>Planned Dates</TableHead>
              <TableHead>Actual Dates</TableHead>
              <TableHead className="w-[140px]">Progress %</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No data.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.site}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs">{dt(r.start_date)} → {dt(r.end_date)}</TableCell>
                  <TableCell className="text-xs">{dt(r.actual_start_date)} → {dt(r.actual_end_date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={r.percent} className="h-2" />
                      <span className="text-xs text-muted-foreground w-9 text-right">{r.percent}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.delayed ? (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Delayed</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{r.status.replace(/_/g, " ")}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

/* ---------------- Expenses ---------------- */
function ExpensesSummary({ from, to, scope }: SectionProps) {
  const ids = scopeFilter(scope);
  const { data } = useQuery({
    queryKey: ["ov-expenses", from, to, ids],
    enabled: !scope.loading,
    queryFn: async () => {
      let q = supabase
        .from("additional_expenses")
        .select("id, user_id, expense_date, category, custom_category, amount, status")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false });
      if (ids) q = q.in("user_id", ids);
      const { data } = await q;
      return data || [];
    },
  });

  const nameMap = useMemo(() => new Map(scope.users.map((u) => [u.id, u.full_name])), [scope.users]);
  const rows = useMemo(
    () =>
      (data || []).map((r) => ({
        id: r.id,
        name: nameMap.get(r.user_id) || "Unknown",
        category: r.category === "Other" ? r.custom_category || "Other" : r.category,
        amount: Number(r.amount || 0),
        date: r.expense_date,
        status: r.status,
      })),
    [data, nameMap]
  );

  const chartData = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.category, (m.get(r.category) || 0) + r.amount));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Expenses Summary</h2>
      <ReportChartCard title="Expenses by Category" type="pie" data={chartData} formatValue={inr} />
      <SectionCard title="Expenses">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No data.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell className="text-right">{inr(r.amount)}</TableCell>
                  <TableCell>{dt(r.date)}</TableCell>
                  <TableCell>{r.status}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

/* ---------------- Payments ---------------- */
function PaymentsSummary({ from, to }: SectionProps) {
  const { data } = useQuery({
    queryKey: ["ov-payments", from, to],
    queryFn: async () => {
      const { data: vendors } = await supabase.from("vendors").select("id, name");
      const vendorMap = new Map((vendors || []).map((v) => [v.id, v.name]));

      const { data: invoices } = await supabase
        .from("procurement_invoices")
        .select("id, po_id, invoice_number, invoice_date, invoice_amount")
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .order("invoice_date", { ascending: false });

      const poIds = [...new Set((invoices || []).map((i) => i.po_id).filter(Boolean))] as string[];
      const { data: orders } = poIds.length
        ? await supabase.from("procurement_orders").select("id, vendor_id").in("id", poIds)
        : { data: [] as { id: string; vendor_id: string | null }[] };
      const orderMap = new Map((orders || []).map((o) => [o.id, o]));

      const invIds = (invoices || []).map((i) => i.id);
      const payMap = new Map<string, { total: number; last?: string | null }>();
      if (invIds.length) {
        const { data: payments } = await supabase
          .from("procurement_invoice_payments")
          .select("invoice_id, amount, payment_date")
          .in("invoice_id", invIds)
          .order("payment_date", { ascending: true });
        (payments || []).forEach((p) => {
          const e = payMap.get(p.invoice_id) || { total: 0 };
          e.total += Number(p.amount || 0);
          e.last = p.payment_date;
          payMap.set(p.invoice_id, e);
        });
      }

      return (invoices || []).map((inv) => {
        const order = inv.po_id ? orderMap.get(inv.po_id) : null;
        const pay = payMap.get(inv.id);
        const amount = Number(inv.invoice_amount || 0);
        const paid = pay?.total || 0;
        return {
          id: inv.id,
          vendor: order?.vendor_id ? vendorMap.get(order.vendor_id) || "-" : "-",
          invoice_number: inv.invoice_number || "—",
          amount,
          paid,
          balance: Math.max(0, amount - paid),
          payment_date: pay?.last || null,
        };
      });
    },
  });

  const rows = data || [];
  const chartData = useMemo(() => {
    const m = new Map<string, { name: string; Paid: number; Pending: number }>();
    rows.forEach((r) => {
      const e = m.get(r.vendor) || { name: r.vendor, Paid: 0, Pending: 0 };
      e.Paid += r.paid;
      e.Pending += r.balance;
      m.set(r.vendor, e);
    });
    return Array.from(m.values());
  }, [rows]);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold">Payments Summary</h2>
      <ReportChartCard
        title="Paid vs Pending by Vendor"
        type="groupedBar"
        data={chartData}
        series={[
          { key: "Paid", label: "Paid", color: "hsl(160 64% 42%)" },
          { key: "Pending", label: "Pending", color: "hsl(35 90% 55%)" },
        ]}
        formatValue={inr}
      />
      <SectionCard title="Payments">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Invoice Number</TableHead>
              <TableHead className="text-right">Invoice Amount</TableHead>
              <TableHead className="text-right">Paid Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Payment Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No data.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.vendor}</TableCell>
                  <TableCell>{r.invoice_number}</TableCell>
                  <TableCell className="text-right">{inr(r.amount)}</TableCell>
                  <TableCell className="text-right">{inr(r.paid)}</TableCell>
                  <TableCell className="text-right">{inr(r.balance)}</TableCell>
                  <TableCell>{dt(r.payment_date)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

export function OverviewSummaries({ from, to, scope }: SectionProps) {
  return (
    <div className="space-y-8">
      <AttendanceSummary from={from} to={to} scope={scope} />
      <ProcurementSummary from={from} to={to} scope={scope} />
      <MilestoneSummary />
      <ExpensesSummary from={from} to={to} scope={scope} />
      <PaymentsSummary from={from} to={to} scope={scope} />
    </div>
  );
}
