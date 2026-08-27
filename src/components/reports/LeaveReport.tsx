import { useEffect, useMemo, useState } from "react";
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
  { value: "from_date", label: "Leave From Date" },
  { value: "to_date", label: "Leave To Date" },
  { value: "created_at", label: "Applied Date", timestamp: true },
];

interface Row {
  id: string;
  user_id: string;
  full_name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_days: number;
  status: string;
  approved_by_name: string;
}

const STATUS = [
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s}</Badge>;
};

export default function LeaveReport() {
  const scope = useReportScope();
  const { state, patch, from, to } = useDateScope("leave", "from_date");
  const [employee, setEmployee] = useState("all");
  const [leaveType, setLeaveType] = useState("all");
  const [status, setStatus] = useState("all");
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("leave_types")
      .select("id, name")
      .order("name")
      .then(({ data }) => setTypes((data || []).map((t) => ({ value: t.id, label: t.name }))));
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("leave_applications")
        .select("id, user_id, leave_type_id, from_date, to_date, total_days, status, approved_by")
        .order("from_date", { ascending: false });

      if (state.field === "created_at") {
        q = q.gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`);
      } else {
        q = q.gte(state.field, from).lte(state.field, to);
      }

      if (employee !== "all") q = q.eq("user_id", employee);
      else if (scope.userIds)
        q = q.in("user_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (leaveType !== "all") q = q.eq("leave_type_id", leaveType);
      if (status !== "all") q = q.eq("status", status);

      const { data, error } = await q;
      if (error) throw error;

      const approverIds = [...new Set((data || []).map((r) => r.approved_by).filter(Boolean))] as string[];
      const { data: approvers } = approverIds.length
        ? await supabase.from("users").select("id, full_name").in("id", approverIds)
        : { data: [] as { id: string; full_name: string }[] };
      const approverMap = new Map((approvers || []).map((a) => [a.id, a.full_name]));
      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      const typeMap = new Map(types.map((t) => [t.value, t.label]));

      setRows(
        (data || []).map((r) => ({
          id: r.id,
          user_id: r.user_id,
          full_name: nameMap.get(r.user_id) || "Unknown",
          leave_type: typeMap.get(r.leave_type_id) || "-",
          from_date: r.from_date,
          to_date: r.to_date,
          total_days: Number(r.total_days || 0),
          status: r.status,
          approved_by_name: r.approved_by ? approverMap.get(r.approved_by) || "-" : "-",
        }))
      );
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
        pdfWidth: 2.5,
      },
      { key: "leave_type", header: "Leave Type", value: (r) => r.leave_type, pdfWidth: 2 },
      { key: "from_date", header: "From", value: (r) => format(new Date(r.from_date), "dd MMM yyyy"), pdfWidth: 1.6 },
      { key: "to_date", header: "To", value: (r) => format(new Date(r.to_date), "dd MMM yyyy"), pdfWidth: 1.6 },
      {
        key: "total_days",
        header: "Days",
        value: (r) => r.total_days,
        numeric: true,
        align: "right",
        pdfWidth: 1,
      },
      {
        key: "status",
        header: "Status",
        value: (r) => r.status,
        render: (r) => statusBadge(r.status),
        pdfWidth: 1.4,
      },
      { key: "approved_by_name", header: "Approved By", value: (r) => r.approved_by_name, pdfWidth: 2 },
    ],
    []
  );

  const summary = useMemo(() => {
    const days = rows.reduce((s, r) => s + r.total_days, 0);
    return [
      { label: "Total Applications", value: String(rows.length) },
      { label: "Approved", value: String(rows.filter((r) => r.status === "approved").length) },
      { label: "Pending", value: String(rows.filter((r) => r.status === "pending").length) },
      { label: "Total Days", value: String(days) },
    ];
  }, [rows]);

  const fieldLabel = DATE_FIELDS.find((f) => f.value === state.field)?.label || state.field;

  return (
    <ReportWorkspace
      module="leave"
      title="Leave Report"
      description="Leave applications with type, duration and approval status."
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading || scope.loading}
      generated={generated}
      onGenerate={generate}
      generatedBy={scope.generatedBy}
      fileName={`leave-report-${from}-to-${to}.pdf`}
      summary={summary}
      defaultCharts={[
        {
          id: "default-type",
          title: "Leave Days by Type",
          type: "bar",
          groupBy: "leave_type",
          measure: "total_days",
          aggregate: "sum",
        },
      ]}
      filterState={{ ...state, employee, leaveType, status }}
      onApplyFilterState={(s) => {
        patch({
          field: (s.field as string) || state.field,
          preset: (s.preset as PresetKey) || state.preset,
          customFrom: (s.customFrom as string) || state.customFrom,
          customTo: (s.customTo as string) || state.customTo,
        });
        setEmployee((s.employee as string) || "all");
        setLeaveType((s.leaveType as string) || "all");
        setStatus((s.status as string) || "all");
      }}
      filterSummary={[
        `${fieldLabel}: ${presetLabel(state.preset)} (${from} to ${to})`,
        `Employee: ${employee === "all" ? "All" : scope.users.find((u) => u.id === employee)?.full_name || "-"}`,
        `Leave Type: ${leaveType === "all" ? "All" : types.find((t) => t.value === leaveType)?.label || "-"}`,
        `Status: ${status === "all" ? "All" : status}`,
      ]}
      filters={
        <>
          <DateScopeFilter module="leave" fields={DATE_FIELDS} state={state} onChange={patch} from={from} to={to} />
          <SelectField
            label="Employee"
            value={employee}
            onChange={setEmployee}
            allLabel="All Employees"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <SelectField label="Leave Type" value={leaveType} onChange={setLeaveType} allLabel="All Types" options={types} />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
        </>
      }
    />
  );
}
