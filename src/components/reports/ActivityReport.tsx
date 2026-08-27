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
import { useOutcomes } from "@/hooks/useOutcomes";

const DATE_FIELDS: DateFieldOption[] = [
  { value: "activity_date", label: "Activity Date" },
  { value: "created_at", label: "Created Date", timestamp: true },
  { value: "updated_at", label: "Last Modified Date", timestamp: true },
];

interface Row {
  id: string;
  full_name: string;
  customer: string;
  activity_date: string;
  site: string;
  milestone: string;
  activity_type: string;
  description: string;
  total_hours: number | null;
  status: string;
  outcome: string;
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    planned: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s.replace(/_/g, " ")}</Badge>;
};

export default function ActivityReport() {
  const scope = useReportScope();
  const { state, patch, from, to } = useDateScope("activities", "activity_date");
  const [employee, setEmployee] = useState("all");
  const [site, setSite] = useState("all");
  const [milestone, setMilestone] = useState("all");
  const [actType, setActType] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [sites, setSites] = useState<{ value: string; label: string }[]>([]);
  const [milestones, setMilestones] = useState<{ value: string; label: string; site_id: string }[]>([]);
  const { data: outcomes = [] } = useOutcomes(true);
  const [actTypes, setActTypes] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("project_sites")
      .select("id, site_name")
      .eq("is_active", true)
      .order("site_name")
      .then(({ data }) => setSites((data || []).map((s) => ({ value: s.id, label: s.site_name }))));
    supabase
      .from("site_milestones")
      .select("id, name, site_id")
      .order("name")
      .then(({ data }) =>
        setMilestones((data || []).map((m) => ({ value: m.id, label: m.name, site_id: m.site_id })))
      );
    supabase
      .from("activity_types_master")
      .select("name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setActTypes((data || []).map((a) => ({ value: a.name, label: a.name }))));
  }, []);

  const milestoneOptions = useMemo(
    () => (site === "all" ? milestones : milestones.filter((m) => m.site_id === site)),
    [milestones, site]
  );

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("activity_events")
        .select("id, user_id, lead_id, activity_date, site_id, milestone_id, activity_type, description, total_hours, status, outcome")
        .order("activity_date", { ascending: false });

      if (state.field === "activity_date") {
        q = q.gte("activity_date", from).lte("activity_date", to);
      } else {
        q = q.gte(state.field, `${from}T00:00:00`).lte(state.field, `${to}T23:59:59`);
      }

      if (employee !== "all") q = q.eq("user_id", employee);
      else if (scope.userIds)
        q = q.in("user_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (site !== "all") q = q.eq("site_id", site);
      if (milestone !== "all") q = q.eq("milestone_id", milestone);
      if (actType !== "all") q = q.eq("activity_type", actType);
      if (outcome !== "all") q = q.eq("outcome", outcome);

      const { data, error } = await q;
      if (error) throw error;
      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      const siteMap = new Map(sites.map((s) => [s.value, s.label]));
      const msMap = new Map(milestones.map((m) => [m.value, m.label]));

      const leadIds = Array.from(new Set((data || []).map((r) => r.lead_id).filter(Boolean))) as string[];
      const leadMap = new Map<string, string>();
      if (leadIds.length) {
        const { data: leadRows } = await supabase.from("leads").select("id, company, name").in("id", leadIds);
        (leadRows || []).forEach((l) => leadMap.set(l.id, l.company || l.name || "-"));
      }

      setRows(
        (data || []).map((r) => ({
          id: r.id,
          full_name: nameMap.get(r.user_id) || "Unknown",
          customer: r.lead_id ? leadMap.get(r.lead_id) || "-" : "-",
          activity_date: r.activity_date,
          site: r.site_id ? siteMap.get(r.site_id) || "-" : "-",
          milestone: r.milestone_id ? msMap.get(r.milestone_id) || "-" : "-",
          activity_type: r.activity_type || "-",
          description: r.description || "-",
          total_hours: r.total_hours,
          status: r.status,
          outcome: (r as { outcome?: string | null }).outcome || "-",
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
        key: "activity_date",
        header: "Date",
        value: (r) => format(new Date(r.activity_date), "dd MMM yyyy"),
        pdfWidth: 1.6,
      },
      {
        key: "full_name",
        header: "Employee",
        value: (r) => r.full_name,
        render: (r) => <span className="font-medium">{r.full_name}</span>,
        pdfWidth: 2,
      },
      {
        key: "customer",
        header: "Customer / Lead",
        value: (r) => r.customer,
        render: (r) => <span className="block max-w-[160px] truncate">{r.customer}</span>,
        pdfWidth: 2.2,
      },
      { key: "activity_type", header: "Activity Type", value: (r) => r.activity_type, pdfWidth: 2.5 },
      {
        key: "description",
        header: "Description",
        value: (r) => r.description,
        render: (r) => <span className="block max-w-[220px] truncate">{r.description}</span>,
        pdfWidth: 3,
      },
      {
        key: "total_hours",
        header: "Hours",
        value: (r) => r.total_hours ?? 0,
        numeric: true,
        align: "right",
        render: (r) => r.total_hours?.toFixed(1) || "--",
        pdfWidth: 1,
      },
      {
        key: "outcome",
        header: "Outcome",
        value: (r) => r.outcome,
        pdfWidth: 2,
      },
      {
        key: "status",
        header: "Status",
        value: (r) => r.status.replace(/_/g, " "),
        render: (r) => statusBadge(r.status),
        pdfWidth: 1.4,
      },
    ],
    []
  );

  const summary = useMemo(() => {
    const completed = rows.filter((r) => r.status === "completed").length;
    return [
      { label: "Total Activities", value: String(rows.length) },
      { label: "Completed", value: String(completed) },
      { label: "Pending", value: String(rows.length - completed) },
      { label: "Total Hours", value: rows.reduce((s, r) => s + (r.total_hours || 0), 0).toFixed(1) },
    ];
  }, [rows]);

  const fieldLabel = DATE_FIELDS.find((f) => f.value === state.field)?.label || state.field;

  return (
    <ReportWorkspace
      module="activities"
      title="Activity Report"
      description="Site activities, milestones, hours logged and status."
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowLink={(r) => `/activities?id=${r.id}`}
      loading={loading || scope.loading}
      generated={generated}
      onGenerate={generate}
      generatedBy={scope.generatedBy}
      fileName={`activity-report-${from}-to-${to}.pdf`}
      summary={summary}
      defaultCharts={[
        {
          id: "default-type",
          title: "Activities by Type",
          type: "bar",
          groupBy: "activity_type",
          measure: "count",
        },
        {
          id: "default-outcome",
          title: "Activities by Outcome",
          type: "pie",
          groupBy: "outcome",
          measure: "count",
        },
      ]}
      filterState={{ ...state, employee, site, milestone, actType, outcome }}
      onApplyFilterState={(s) => {
        patch({
          field: (s.field as string) || state.field,
          preset: (s.preset as PresetKey) || state.preset,
          customFrom: (s.customFrom as string) || state.customFrom,
          customTo: (s.customTo as string) || state.customTo,
        });
        setEmployee((s.employee as string) || "all");
        setSite((s.site as string) || "all");
        setMilestone((s.milestone as string) || "all");
        setActType((s.actType as string) || "all");
        setOutcome((s.outcome as string) || "all");
      }}
      filterSummary={[
        `${fieldLabel}: ${presetLabel(state.preset)} (${from} to ${to})`,
        `Employee: ${employee === "all" ? "All" : scope.users.find((u) => u.id === employee)?.full_name || "-"}`,
        `Activity Type: ${actType === "all" ? "All" : actType}`,
        `Outcome: ${outcome === "all" ? "All" : outcome}`,
      ]}
      filters={
        <>
          <DateScopeFilter
            module="activities"
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
          <SelectField label="Activity Type" value={actType} onChange={setActType} allLabel="All Types" options={actTypes} />
          <SelectField
            label="Outcome"
            value={outcome}
            onChange={setOutcome}
            allLabel="All Outcomes"
            options={outcomes.map((o) => ({ value: o.name, label: o.name }))}
          />
        </>
      }
    />
  );
}
