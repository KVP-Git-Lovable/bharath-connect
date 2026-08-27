import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SelectField, DateScopeFilter } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { ReportWorkspace } from "./ReportWorkspace";
import { buildLeadRollups, EMPTY_ROLLUP } from "@/lib/leadActivityRollups";
import type { ReportColumn } from "./reportTypes";
import {
  DateFieldOption,
  PresetKey,
  useDateScope,
  presetLabel,
} from "./dateScope";

const DATE_FIELDS: DateFieldOption[] = [
  { value: "created_at", label: "Lead Created Date", column: "created_at", timestamp: true },
  { value: "updated_at", label: "Last Modified Date", column: "updated_at", timestamp: true },
  { value: "opportunity_close_date", label: "Opportunity Close Date", column: "opportunity_close_date" },
  { value: "activity_date", label: "Activity Date" },
];

interface Row {
  id: string;
  name: string;
  company: string;
  phone: string;
  designation: string;
  status: string;
  source: string;
  owner: string;
  value: number;
  probability: number;
  close_date: string | null;
  created_at: string;
  updated_at: string;
  activity_count: number;
  productive_count: number;
  last_activity_date: string | null;
  days_since_last_activity: number | null;
  next_activity_date: string | null;
}

/** Small numeric filter used for the activity roll-up thresholds. */
function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default function LeadReport() {
  const scope = useReportScope();
  const { state, patch, from, to } = useDateScope("leads", "created_at");
  const [owner, setOwner] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [minProductive, setMinProductive] = useState("");
  const [maxProductive, setMaxProductive] = useState("");
  const [minDaysSince, setMinDaysSince] = useState("");
  const [maxDaysSince, setMaxDaysSince] = useState("");
  const [statuses, setStatuses] = useState<{ value: string; label: string }[]>([]);
  const [sources, setSources] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);


  useEffect(() => {
    supabase
      .from("master_lead_statuses")
      .select("id, name")
      .order("name")
      .then(({ data }) => setStatuses((data || []).map((s) => ({ value: s.id, label: s.name }))));
    supabase
      .from("master_lead_sources")
      .select("id, name")
      .order("name")
      .then(({ data }) => setSources((data || []).map((s) => ({ value: s.id, label: s.name }))));
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("leads")
        .select(
          "id, name, company, phone, title, owner_id, lead_status_id, lead_source_id, opportunity_value, opportunity_probability, opportunity_close_date, created_at, updated_at"
        )
        .order("created_at", { ascending: false });

      if (state.field === "activity_date") {
        const { data: evs, error: evErr } = await supabase
          .from("activity_events")
          .select("lead_id")
          .not("lead_id", "is", null)
          .gte("activity_date", from)
          .lte("activity_date", to);
        if (evErr) throw evErr;
        const ids = Array.from(new Set((evs || []).map((e) => e.lead_id as string)));
        if (!ids.length) {
          setRows([]);
          setGenerated(true);
          return;
        }
        q = q.in("id", ids);
      } else if (state.field === "opportunity_close_date") {
        q = q.gte("opportunity_close_date", from).lte("opportunity_close_date", to);
      } else {
        q = q.gte(state.field, `${from}T00:00:00`).lte(state.field, `${to}T23:59:59`);
      }

      if (owner !== "all") q = q.eq("owner_id", owner);
      else if (scope.userIds)
        q = q.in("owner_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (status !== "all") q = q.eq("lead_status_id", status);
      if (source !== "all") q = q.eq("lead_source_id", source);

      const { data, error } = await q;
      if (error) throw error;

      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      const statusMap = new Map(statuses.map((s) => [s.value, s.label]));
      const sourceMap = new Map(sources.map((s) => [s.value, s.label]));

      // Activity & effort roll-ups for the returned leads.
      const leadIds = (data || []).map((r) => r.id);
      let rollups: Record<string, ReturnType<typeof buildLeadRollups>[string]> = {};
      if (leadIds.length) {
        const { data: acts } = await supabase
          .from("activity_events")
          .select("lead_id, status, outcome, activity_date")
          .in("lead_id", leadIds);
        rollups = buildLeadRollups(acts || []);
      }

      const minP = minProductive === "" ? null : Number(minProductive);
      const maxP = maxProductive === "" ? null : Number(maxProductive);
      const minD = minDaysSince === "" ? null : Number(minDaysSince);
      const maxD = maxDaysSince === "" ? null : Number(maxDaysSince);

      const mapped: Row[] = (data || []).map((r) => {
        const ru = rollups[r.id] ?? EMPTY_ROLLUP;
        return {
          id: r.id,
          name: r.name,
          company: r.company || "-",
          phone: r.phone || "-",
          designation: r.title || "-",
          status: r.lead_status_id ? statusMap.get(r.lead_status_id) || "-" : "-",
          source: r.lead_source_id ? sourceMap.get(r.lead_source_id) || "-" : "-",
          owner: r.owner_id ? nameMap.get(r.owner_id) || "-" : "-",
          value: Number(r.opportunity_value || 0),
          probability: Number(r.opportunity_probability || 0),
          close_date: r.opportunity_close_date,
          created_at: r.created_at,
          updated_at: r.updated_at,
          activity_count: ru.activityCount,
          productive_count: ru.productiveCount,
          last_activity_date: ru.lastActivityDate,
          days_since_last_activity: ru.daysSinceLastActivity,
          next_activity_date: ru.nextActivityDate,
        };
      });

      setRows(
        mapped.filter((r) => {
          if (minP != null && r.productive_count < minP) return false;
          if (maxP != null && r.productive_count > maxP) return false;
          if (minD != null && (r.days_since_last_activity == null || r.days_since_last_activity < minD)) return false;
          if (maxD != null && (r.days_since_last_activity == null || r.days_since_last_activity > maxD)) return false;
          return true;
        })
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
        key: "name",
        header: "Lead",
        value: (r) => r.name,
        render: (r) => <span className="font-medium">{r.name}</span>,
        pdfWidth: 2.2,
      },
      { key: "company", header: "Company", value: (r) => r.company, pdfWidth: 2.2 },
      { key: "designation", header: "Designation", value: (r) => r.designation, pdfWidth: 1.8 },
      {
        key: "status",
        header: "Status",
        value: (r) => r.status,
        render: (r) => <Badge variant="secondary">{r.status}</Badge>,
        pdfWidth: 1.6,
      },
      { key: "source", header: "Source", value: (r) => r.source, pdfWidth: 1.6 },
      { key: "owner", header: "Owner", value: (r) => r.owner, pdfWidth: 2 },
      {
        key: "value",
        header: "Opportunity Value",
        value: (r) => r.value,
        numeric: true,
        align: "right",
        pdfWidth: 1.6,
      },
      {
        key: "probability",
        header: "Win %",
        value: (r) => r.probability,
        numeric: true,
        align: "right",
        pdfWidth: 1,
      },
      {
        key: "close_date",
        header: "Close Date",
        value: (r) => (r.close_date ? format(new Date(r.close_date), "dd MMM yyyy") : "-"),
        pdfWidth: 1.6,
      },
      {
        key: "phone",
        header: "Phone",
        value: (r) => r.phone,
        pdfWidth: 1.6,
        defaultHidden: true,
      },
      {
        key: "created_at",
        header: "Created",
        value: (r) => format(new Date(r.created_at), "dd MMM yyyy"),
        pdfWidth: 1.6,
        defaultHidden: true,
      },
      {
        key: "updated_at",
        header: "Last Modified",
        value: (r) => format(new Date(r.updated_at), "dd MMM yyyy"),
        pdfWidth: 1.6,
        defaultHidden: true,
      },
      // ---- Activity & effort highlight roll-ups ----
      {
        key: "activity_count",
        header: "# Activities",
        value: (r) => r.activity_count,
        numeric: true,
        align: "right",
        pdfWidth: 1.2,
      },
      {
        key: "productive_count",
        header: "# Productive Activities",
        value: (r) => r.productive_count,
        numeric: true,
        align: "right",
        pdfWidth: 1.4,
      },
      {
        key: "last_activity_date",
        header: "Last Activity Date",
        value: (r) => (r.last_activity_date ? format(new Date(r.last_activity_date), "dd MMM yyyy") : "-"),
        pdfWidth: 1.6,
      },
      {
        key: "days_since_last_activity",
        header: "Days Since Last Activity",
        value: (r) => r.days_since_last_activity,
        numeric: true,
        align: "right",
        pdfWidth: 1.4,
      },
      {
        key: "next_activity_date",
        header: "Next Activity Date",
        value: (r) => (r.next_activity_date ? format(new Date(r.next_activity_date), "dd MMM yyyy") : "-"),
        pdfWidth: 1.6,
      },
    ],
    []
  );


  const summary = useMemo(() => {
    const pipeline = rows.reduce((s, r) => s + r.value, 0);
    return [
      { label: "Total Leads", value: String(rows.length) },
      { label: "Pipeline Value", value: `₹${pipeline.toLocaleString("en-IN")}` },
      { label: "With Close Date", value: String(rows.filter((r) => r.close_date).length) },
      {
        label: "Avg. Value",
        value: rows.length ? `₹${Math.round(pipeline / rows.length).toLocaleString("en-IN")}` : "₹0",
      },
    ];
  }, [rows]);

  const fieldLabel = DATE_FIELDS.find((f) => f.value === state.field)?.label || state.field;

  return (
    <ReportWorkspace
      module="leads"
      title="Lead Report"
      description="Leads with status, source, owner and opportunity pipeline."
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowLink={(r) => `/leads/${r.id}`}
      loading={loading || scope.loading}
      generated={generated}
      onGenerate={generate}
      generatedBy={scope.generatedBy}
      fileName={`lead-report-${from}-to-${to}.pdf`}
      summary={summary}
      filterState={{ ...state, owner, status, source, minProductive, maxProductive, minDaysSince, maxDaysSince }}
      onApplyFilterState={(s) => {
        patch({
          field: (s.field as string) || state.field,
          preset: (s.preset as PresetKey) || state.preset,
          customFrom: (s.customFrom as string) || state.customFrom,
          customTo: (s.customTo as string) || state.customTo,
        });
        setOwner((s.owner as string) || "all");
        setStatus((s.status as string) || "all");
        setSource((s.source as string) || "all");
        setMinProductive((s.minProductive as string) ?? "");
        setMaxProductive((s.maxProductive as string) ?? "");
        setMinDaysSince((s.minDaysSince as string) ?? "");
        setMaxDaysSince((s.maxDaysSince as string) ?? "");
      }}
      defaultCharts={[
        {
          id: "productive-by-owner",
          title: "Productive Activities by Owner",
          type: "bar",
          groupBy: "owner",
          measure: "productive_count",
          aggregate: "sum",
        },
      ]}
      filterSummary={[
        `${fieldLabel}: ${presetLabel(state.preset)} (${from} to ${to})`,
        `Owner: ${owner === "all" ? "All" : scope.users.find((u) => u.id === owner)?.full_name || "-"}`,
        `Status: ${status === "all" ? "All" : statuses.find((s) => s.value === status)?.label || "-"}`,
        `Source: ${source === "all" ? "All" : sources.find((s) => s.value === source)?.label || "-"}`,
        `Productive activities: ${minProductive || "0"} – ${maxProductive || "∞"}`,
        `Days since last activity: ${minDaysSince || "0"} – ${maxDaysSince || "∞"}`,
      ]}
      filters={
        <>
          <DateScopeFilter
            module="leads"
            fields={DATE_FIELDS}
            state={state}
            onChange={patch}
            from={from}
            to={to}
          />
          <SelectField
            label="Owner"
            value={owner}
            onChange={setOwner}
            allLabel="All Owners"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={statuses} />
          <SelectField label="Source" value={source} onChange={setSource} allLabel="All Sources" options={sources} />
          <NumberField label="Min # Productive Activities" value={minProductive} onChange={setMinProductive} placeholder="Any" />
          <NumberField label="Max # Productive Activities" value={maxProductive} onChange={setMaxProductive} placeholder="Any" />
          <NumberField label="Min Days Since Last Activity" value={minDaysSince} onChange={setMinDaysSince} placeholder="Any" />
          <NumberField label="Max Days Since Last Activity" value={maxDaysSince} onChange={setMaxDaysSince} placeholder="Any" />
        </>
      }
    />

  );
}
