import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell, SummaryCards } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { useReportContext, DateRangePill } from "@/components/analytics/ReportContext";
import { generateReportPdf } from "./reportPdf";
import { listClaims } from "@/utils/expenseClaims";

interface Row {
  id: string;
  full_name: string;
  approver: string;
  claim_date: string;
  travel: number;
  petty: number;
  other: number;
  meeting_mins: number;
  total: number;
  status: string;
}

const STATUS = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const inr = (n: number) => `Rs ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function ClaimsReport() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo } = useReportContext();
  const [employee, setEmployee] = useState("all");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const claims = await listClaims({
        from, to, status,
        userIds: employee !== "all" ? [employee] : scope.userIds,
      });
      const ids = claims.map((c) => c.id);
      const { data: lines } = ids.length
        ? await (supabase as any).from("expense_claim_lines").select("claim_id, line_type, amount, minutes").in("claim_id", ids)
        : { data: [] };
      const agg = new Map<string, { travel: number; petty: number; other: number; mins: number }>();
      (lines || []).forEach((l: any) => {
        const a = agg.get(l.claim_id) || { travel: 0, petty: 0, other: 0, mins: 0 };
        const amt = Number(l.amount || 0);
        if (l.line_type === "travel") a.travel += amt;
        else if (l.line_type === "petty_cash") a.petty += amt;
        else if (l.line_type === "meeting") a.mins += Number(l.minutes || 0);
        else a.other += amt;
        agg.set(l.claim_id, a);
      });
      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      setRows(claims.map((c) => {
        const a = agg.get(c.id) || { travel: 0, petty: 0, other: 0, mins: 0 };
        return {
          id: c.id,
          full_name: nameMap.get(c.user_id) || "Unknown",
          approver: c.approver_id ? nameMap.get(c.approver_id) || "Manager" : "—",
          claim_date: c.claim_date,
          travel: a.travel, petty: a.petty, other: a.other, meeting_mins: a.mins,
          total: c.total_amount,
          status: c.status,
        };
      }));
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const sum = (f: (r: Row) => boolean) => rows.filter(f).reduce((s, r) => s + r.total, 0);
    return [
      { label: "Claims", value: String(rows.length) },
      { label: "Total Claimed", value: inr(sum(() => true)) },
      { label: "Awaiting Approval", value: inr(sum((r) => r.status === "submitted")) },
      { label: "Approved", value: inr(sum((r) => r.status === "approved")) },
    ];
  }, [rows]);

  const chartData = useMemo(() => {
    const t = rows.reduce((a, r) => ({ travel: a.travel + r.travel, petty: a.petty + r.petty, other: a.other + r.other }), { travel: 0, petty: 0, other: 0 });
    return [
      { name: "Travel", value: t.travel },
      { name: "Petty cash", value: t.petty },
      { name: "Other expenses", value: t.other },
    ].filter((d) => d.value > 0);
  }, [rows]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Expense Claims Report",
        fileName: `claims-report-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Period: ${from} to ${to}`,
          `Employee: ${employee === "all" ? "All" : scope.users.find((u) => u.id === employee)?.full_name || "-"}`,
          `Status: ${status === "all" ? "All" : status}`,
        ],
        columns: [
          { header: "Employee", width: 3 },
          { header: "Date", width: 2 },
          { header: "Travel", width: 1.8, align: "right" },
          { header: "Petty cash", width: 1.8, align: "right" },
          { header: "Other", width: 1.8, align: "right" },
          { header: "Total", width: 2, align: "right" },
          { header: "Status", width: 1.6 },
        ],
        rows: rows.map((r) => [
          r.full_name, format(new Date(r.claim_date), "dd MMM yyyy"),
          inr(r.travel), inr(r.petty), inr(r.other), inr(r.total), r.status,
        ]),
        summary,
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ReportShell
      title="Expense Claims Report"
      description="Daily claims with travel, meeting and petty cash lines, and their approval status."
      pill={<DateRangePill />}
      loading={loading || scope.loading}
      downloading={downloading}
      generated={generated}
      recordCount={rows.length}
      onGenerate={generate}
      onDownload={download}
      filters={
        <>
          <DateField label="From Date" value={from} onChange={setFrom} />
          <DateField label="To Date" value={to} onChange={setTo} />
          <SelectField label="Employee" value={employee} onChange={setEmployee} allLabel="All Employees"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))} />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
        </>
      }
      summary={<SummaryCards items={summary} />}
      chart={<ReportChartCard title="Claimed by Type" description="Travel, petty cash and other expenses" type="pie" data={chartData} formatValue={inr} />}
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Travel</TableHead>
              <TableHead className="text-right">Meeting</TableHead>
              <TableHead className="text-right">Petty cash</TableHead>
              <TableHead className="text-right">Other</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.full_name}</TableCell>
                <TableCell>{format(new Date(r.claim_date), "dd MMM yyyy")}</TableCell>
                <TableCell className="text-right">{inr(r.travel)}</TableCell>
                <TableCell className="text-right">{r.meeting_mins} min</TableCell>
                <TableCell className="text-right">{inr(r.petty)}</TableCell>
                <TableCell className="text-right">{inr(r.other)}</TableCell>
                <TableCell className="text-right font-semibold">{inr(r.total)}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{r.status}</Badge></TableCell>
                <TableCell>{r.approver}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
