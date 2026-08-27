import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell, SummaryCards } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { useReportContext, DateRangePill } from "@/components/analytics/ReportContext";
import { generateReportPdf } from "./reportPdf";

interface Row {
  id: string;
  full_name: string;
  expense_date: string;
  category: string;
  amount: number;
  status: string;
}

const STATUS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "submitted", label: "Submitted" },
];

const inr = (n: number) => `Rs ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s}</Badge>;
};

export default function ExpenseReport() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo } = useReportContext();
  const [employee, setEmployee] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [cats, setCats] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("expense_categories")
      .select("name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setCats((data || []).map((c) => ({ value: c.name, label: c.name }))));
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("additional_expenses")
        .select("id, user_id, expense_date, category, custom_category, amount, status")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false });
      if (employee !== "all") q = q.eq("user_id", employee);
      else if (scope.userIds) q = q.in("user_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (category !== "all") q = q.eq("category", category);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      setRows(
        (data || []).map((r) => ({
          id: r.id,
          full_name: nameMap.get(r.user_id) || "Unknown",
          expense_date: r.expense_date,
          category: r.category === "Other" ? r.custom_category || "Other" : r.category,
          amount: Number(r.amount || 0),
          status: r.status,
        }))
      );
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const pending = rows.filter((r) => r.status === "pending" || r.status === "submitted").reduce((s, r) => s + r.amount, 0);
    const approved = rows.filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0);
    return [
      { label: "Total Records", value: String(rows.length) },
      { label: "Total Expenses", value: inr(total) },
      { label: "Pending Amount", value: inr(pending) },
      { label: "Approved Amount", value: inr(approved) },
    ];
  }, [rows]);

  const chartData = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.category, (m.get(r.category) || 0) + r.amount));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Expense Report",
        fileName: `expense-report-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Period: ${from} to ${to}`,
          `Employee: ${employee === "all" ? "All" : scope.users.find((u) => u.id === employee)?.full_name || "-"}`,
          `Category: ${category === "all" ? "All" : category}`,
          `Status: ${status === "all" ? "All" : status}`,
        ],
        columns: [
          { header: "Employee", width: 3 },
          { header: "Date", width: 2 },
          { header: "Category", width: 2.5 },
          { header: "Amount", width: 2, align: "right" },
          { header: "Status", width: 1.6 },
        ],
        rows: rows.map((r) => [
          r.full_name,
          format(new Date(r.expense_date), "dd MMM yyyy"),
          r.category,
          inr(r.amount),
          r.status,
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
      title="Expense Report"
      description="Employee expenses by category with approval status."
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
          <SelectField
            label="Employee"
            value={employee}
            onChange={setEmployee}
            allLabel="All Employees"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <SelectField label="Category" value={category} onChange={setCategory} allLabel="All Categories" options={cats} />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
        </>
      }
      summary={<SummaryCards items={summary} />}
      chart={
        <ReportChartCard
          title="Expenses by Category"
          description="Total expense amount grouped by category"
          type="pie"
          data={chartData}
          formatValue={inr}
        />
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.full_name}</TableCell>
                <TableCell>{format(new Date(r.expense_date), "dd MMM yyyy")}</TableCell>
                <TableCell>{r.category}</TableCell>
                <TableCell className="text-right">{inr(r.amount)}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
