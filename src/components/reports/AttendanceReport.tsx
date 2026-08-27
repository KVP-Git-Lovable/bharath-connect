import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SelectField, DateScopeFilter } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { ReportWorkspace } from "./ReportWorkspace";
import type { ReportColumn } from "./reportTypes";
import { DateFieldOption, PresetKey, presetLabel, useDateScope } from "./dateScope";

const DATE_FIELDS: DateFieldOption[] = [
  { value: "date", label: "Attendance Date" },
  { value: "created_at", label: "Created Date", timestamp: true },
];

interface Row {
  id: string;
  user_id: string;
  full_name: string;
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_hours: number | null;
}

const STATUS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "leave", label: "Leave" },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    present: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    absent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    late: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    leave: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s.replace(/_/g, " ")}</Badge>;
};

const t = (d: string | null) => (d ? format(new Date(d), "HH:mm") : "--");

export default function AttendanceReport() {
  const scope = useReportScope();
  const { state, patch, from, to } = useDateScope("attendance", "date");
  const [employee, setEmployee] = useState("all");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("attendance")
        .select("id, user_id, date, status, check_in_time, check_out_time, total_hours")
        .order("date", { ascending: true });

      if (state.field === "date") q = q.gte("date", from).lte("date", to);
      else q = q.gte(state.field, `${from}T00:00:00`).lte(state.field, `${to}T23:59:59`);

      if (employee !== "all") q = q.eq("user_id", employee);
      else if (scope.userIds)
        q = q.in("user_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (status !== "all") q = q.eq("status", status);

      const { data, error } = await q;
      if (error) throw error;
      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      setRows((data || []).map((r) => ({ ...r, full_name: nameMap.get(r.user_id) || "Unknown" })));
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const columns: ReportColumn<Row>[] = useMemo(
    () => [
      {
        key: "full_name",
        header: "Employee",
        value: (r) => r.full_name,
        render: (r) => <span className="font-medium">{r.full_name}</span>,
        pdfWidth: 3,
      },
      { key: "date", header: "Date", value: (r) => format(new Date(r.date), "dd MMM yyyy"), pdfWidth: 2 },
      { key: "check_in_time", header: "Check In", value: (r) => t(r.check_in_time), pdfWidth: 1.5 },
      { key: "check_out_time", header: "Check Out", value: (r) => t(r.check_out_time), pdfWidth: 1.5 },
      {
        key: "total_hours",
        header: "Hours",
        value: (r) => r.total_hours ?? 0,
        numeric: true,
        align: "right",
        render: (r) => r.total_hours?.toFixed(2) || "--",
        pdfWidth: 1.2,
      },
      {
        key: "status",
        header: "Status",
        value: (r) => r.status.replace(/_/g, " "),
        render: (r) => statusBadge(r.status),
        pdfWidth: 1.6,
      },
    ],
    []
  );

  const summary = useMemo(() => {
    const present = rows.filter((r) => r.status === "present" || r.status === "late").length;
    const absent = rows.filter((r) => r.status === "absent").length;
    const hrs = rows.filter((r) => r.total_hours != null);
    const avg = hrs.length ? hrs.reduce((s, r) => s + (r.total_hours || 0), 0) / hrs.length : 0;
    return [
      { label: "Total Records", value: String(rows.length) },
      { label: "Present Days", value: String(present) },
      { label: "Absent Days", value: String(absent) },
      { label: "Avg Hours / Day", value: avg.toFixed(2) },
    ];
  }, [rows]);

  const fieldLabel = DATE_FIELDS.find((f) => f.value === state.field)?.label || state.field;

  return (
    <ReportWorkspace
      module="attendance"
      title="Attendance Report"
      description="Check-in/out times, total hours and status per employee."
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading || scope.loading}
      generated={generated}
      onGenerate={generate}
      generatedBy={scope.generatedBy}
      fileName={`attendance-report-${from}-to-${to}.pdf`}
      summary={summary}
      defaultCharts={[
        {
          id: "default-status",
          title: "Records by Status",
          type: "pie",
          groupBy: "status",
          measure: "count",
        },
      ]}
      filterState={{ ...state, employee, status }}
      onApplyFilterState={(s) => {
        patch({
          field: (s.field as string) || state.field,
          preset: (s.preset as PresetKey) || state.preset,
          customFrom: (s.customFrom as string) || state.customFrom,
          customTo: (s.customTo as string) || state.customTo,
        });
        setEmployee((s.employee as string) || "all");
        setStatus((s.status as string) || "all");
      }}
      filterSummary={[
        `${fieldLabel}: ${presetLabel(state.preset)} (${from} to ${to})`,
        `Employee: ${employee === "all" ? "All" : scope.users.find((u) => u.id === employee)?.full_name || "-"}`,
        `Status: ${status === "all" ? "All" : status}`,
      ]}
      filters={
        <>
          <DateScopeFilter
            module="attendance"
            fields={DATE_FIELDS}
            state={state}
            onChange={patch}
            from={from}
            to={to}
          />
          <SelectField
            label="Employee"
            value={employee}
            onChange={setEmployee}
            allLabel="All Employees"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
        </>
      }
    />
  );
}
