import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { resolveSignedUrl } from "@/utils/signedStorage";
import { TRAVEL_PROOF_BUCKET } from "@/utils/activityTravel";
import { supabase } from "@/integrations/supabase/client";
import { SelectField, DateScopeFilter } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { ReportWorkspace } from "./ReportWorkspace";
import type { ReportColumn } from "./reportTypes";
import { DateFieldOption, PresetKey, presetLabel, useDateScope } from "./dateScope";
import { useOutcomes } from "@/hooks/useOutcomes";
import { fetchTaRates, rateForDate, type TaRate } from "@/hooks/useTaRates";

const DATE_FIELDS: DateFieldOption[] = [
  { value: "activity_date", label: "Activity Date" },
  { value: "created_at", label: "Created Date", timestamp: true },
];

const STATUS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

interface Row {
  id: string;
  full_name: string;
  activity_date: string;
  month: string;
  activity_type: string;
  outcome: string;
  status: string;
  customer: string;
  km: number;
  is_manual: boolean;
  travel_mins: number;
  rate: number;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  amount: number;
  /** Public transport fare, when this leg was a bus or cab. */
  fare: number | null;
  proofs: { url: string; name: string }[];
}

/** The activity columns this report reads. */
export interface TravelSource {
  id: string;
  user_id: string;
  lead_id: string | null;
  activity_date: string;
  activity_type: string | null;
  outcome: string | null;
  status: string | null;
  travel_distance_km: number | null;
  manual_distance_km: number | null;
  manual_fare_amount?: number | null;
  manual_distance_attachments?: { url: string; name: string }[] | null;
  travel_time_mins: number | null;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
}

/**
 * One activity as a report row. Kept pure and exported so the fare rules can
 * be tested: a public transport leg is worth the fare that was paid, not
 * km x rate, and carries the receipt the rep attached.
 */
export function toTravelRow(
  r: TravelSource,
  ctx: { name: string; customer: string; rate: number },
): Row {
  const manual = r.manual_distance_km != null;
  const km = Number((manual ? r.manual_distance_km : r.travel_distance_km) || 0);
  const fare = r.manual_fare_amount == null ? null : Number(r.manual_fare_amount);
  return {
    id: r.id,
    full_name: ctx.name,
    activity_date: r.activity_date,
    month: format(new Date(r.activity_date), "MMM yyyy"),
    activity_type: r.activity_type || "-",
    outcome: r.outcome || "-",
    status: r.status || "-",
    customer: ctx.customer,
    km,
    is_manual: manual,
    travel_mins: Number(r.travel_time_mins || 0),
    start_time: r.start_time,
    end_time: r.end_time,
    hours: Number(r.total_hours || 0),
    rate: ctx.rate,
    // A fare is what the rep actually paid, so it replaces km x rate.
    amount: fare != null ? fare : km * ctx.rate,
    fare,
    proofs: r.manual_distance_attachments || [],
  };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Attachments live in a private bucket, so they need a signed URL to open. */
const openProof = async (path: string) => {
  const url = await resolveSignedUrl(TRAVEL_PROOF_BUCKET, path);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  else toast.error("Could not open the attachment");
};
const hhmm = (t: string | null) => (t ? format(new Date(t), "dd MMM HH:mm") : "--");

export default function TravelExpenseReport() {
  const scope = useReportScope();
  const { state, patch, from, to } = useDateScope("travel-expense", "activity_date");
  const { data: outcomes = [] } = useOutcomes(true);
  const [employee, setEmployee] = useState("all");
  const [actType, setActType] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [status, setStatus] = useState("all");
  const [actTypes, setActTypes] = useState<{ value: string; label: string }[]>([]);
  const [rate, setRate] = useState(0);
  const [taRates, setTaRates] = useState<TaRate[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("activity_types_master")
      .select("name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setActTypes((data || []).map((a) => ({ value: a.name, label: a.name }))));
    supabase
      .from("expense_master_config")
      .select("ta_per_km_rate")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setRate(Number(data?.ta_per_km_rate || 0)));
    fetchTaRates().then(setTaRates).catch(() => setTaRates([]));
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("activity_events")
        .select(
          "id, user_id, lead_id, activity_date, activity_type, outcome, status, travel_distance_km, manual_distance_km, manual_fare_amount, manual_distance_attachments, travel_time_mins, start_time, end_time, total_hours, created_at"
        )
        .order("activity_date", { ascending: false });

      if (state.field === "activity_date") q = q.gte("activity_date", from).lte("activity_date", to);
      else q = q.gte(state.field, `${from}T00:00:00`).lte(state.field, `${to}T23:59:59`);

      if (employee !== "all") q = q.eq("user_id", employee);
      else if (scope.userIds)
        q = q.in("user_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (actType !== "all") q = q.eq("activity_type", actType);
      if (outcome !== "all") q = q.eq("outcome", outcome);
      if (status !== "all") q = q.eq("status", status);

      const { data, error } = await q;
      if (error) throw error;

      const leadIds = Array.from(new Set((data || []).map((r) => r.lead_id).filter(Boolean))) as string[];
      const leadMap = new Map<string, string>();
      if (leadIds.length) {
        const { data: leads } = await supabase.from("leads").select("id, company, name").in("id", leadIds);
        (leads || []).forEach((l) => leadMap.set(l.id, l.company || l.name || "-"));
      }

      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));

      setRows(
        (data || []).map((r) =>
          toTravelRow(r as TravelSource, {
            name: nameMap.get(r.user_id) || "Unknown",
            customer: r.lead_id ? leadMap.get(r.lead_id) || "-" : "-",
            rate: taRates.length ? rateForDate(taRates, r.activity_date) : rate,
          }),
        )
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
        pdfWidth: 1.7,
      },
      {
        key: "full_name",
        header: "Team Member",
        value: (r) => r.full_name,
        render: (r) => <span className="font-medium">{r.full_name}</span>,
        pdfWidth: 2.2,
      },
      {
        key: "customer",
        header: "Customer / Lead",
        value: (r) => r.customer,
        render: (r) => <span className="block max-w-[160px] truncate">{r.customer}</span>,
        pdfWidth: 2.2,
      },
      { key: "activity_type", header: "Activity Type", value: (r) => r.activity_type, pdfWidth: 2.2 },
      { key: "outcome", header: "Outcome", value: (r) => r.outcome, pdfWidth: 2 },
      {
        key: "km",
        header: "KM Travelled",
        value: (r) => Number(r.km.toFixed(2)),
        numeric: true,
        align: "right",
        render: (r) => (
          <span className="inline-flex items-center gap-1">
            {r.km.toFixed(1)}
            {r.is_manual && <Badge variant="outline" className="text-[10px]">manual</Badge>}
          </span>
        ),
        pdfWidth: 1.4,
      },
      {
        key: "travel_mins",
        header: "Travel Time (min)",
        value: (r) => r.travel_mins,
        numeric: true,
        align: "right",
        pdfWidth: 1.5,
      },
      { key: "start_time", header: "Start", value: (r) => hhmm(r.start_time), pdfWidth: 1.9 },
      { key: "end_time", header: "End", value: (r) => hhmm(r.end_time), pdfWidth: 1.9 },
      {
        key: "hours",
        header: "Hours",
        value: (r) => Number(r.hours.toFixed(2)),
        numeric: true,
        align: "right",
        render: (r) => (r.hours ? r.hours.toFixed(1) : "--"),
        pdfWidth: 1.1,
        defaultHidden: true,
      },
      {
        key: "rate",
        header: "Rate (/km)",
        // A fare leg is not priced per km, so it has no rate to show.
        value: (r) => (r.fare != null ? "" : Number(r.rate.toFixed(2))),
        numeric: true,
        align: "right",
        render: (r) => (r.fare != null ? "—" : inr(r.rate)),
        pdfWidth: 1.3,
      },
      {
        key: "amount",
        header: "Travel Expense",
        value: (r) => Number(r.amount.toFixed(2)),
        numeric: true,
        align: "right",
        render: (r) => inr(r.amount),
        pdfWidth: 1.8,
      },
      {
        key: "fare",
        header: "Fare paid",
        value: (r) => (r.fare == null ? "" : Number(r.fare.toFixed(2))),
        numeric: true,
        align: "right",
        render: (r) => (r.fare == null ? "—" : inr(r.fare)),
        pdfWidth: 1.5,
      },
      {
        key: "proofs",
        header: "Receipt",
        // PDF and CSV get a count; the table gets clickable links.
        value: (r) => (r.proofs.length ? `${r.proofs.length} attached` : ""),
        render: (r) =>
          r.proofs.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="flex flex-wrap gap-2">
              {r.proofs.map((p, i) => (
                <button
                  key={`${p.url}-${i}`}
                  type="button"
                  className="text-primary underline underline-offset-2"
                  onClick={() => openProof(p.url)}
                >
                  {r.proofs.length > 1 ? `View ${i + 1}` : "View"}
                </button>
              ))}
            </span>
          ),
        pdfWidth: 1.4,
      },
      { key: "status", header: "Status", value: (r) => r.status.replace(/_/g, " "), pdfWidth: 1.5, defaultHidden: true },
      { key: "month", header: "Month", value: (r) => r.month, pdfWidth: 1.6, defaultHidden: true },
    ],
    []
  );

  const summary = useMemo(() => {
    const km = rows.reduce((s, r) => s + r.km, 0);
    const mins = rows.reduce((s, r) => s + r.travel_mins, 0);
    const amt = rows.reduce((s, r) => s + r.amount, 0);
    const people = new Set(rows.map((r) => r.full_name)).size;
    return [
      { label: "Activities", value: String(rows.length) },
      { label: "Total KM", value: km.toFixed(1) },
      { label: "Travel Time", value: `${Math.floor(mins / 60)}h ${mins % 60}m` },
      { label: "Travel Expense", value: inr(amt) },
      { label: "Team Members", value: String(people) },
    ];
  }, [rows, rate]);

  const fieldLabel = DATE_FIELDS.find((f) => f.value === state.field)?.label || state.field;

  return (
    <ReportWorkspace
      module="travel-expense"
      title="Travel Expense Report"
      description="Distance, travel time and travel cost per activity, by team member, date, activity type and outcome."
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowLink={(r) => `/activities?id=${r.id}`}
      loading={loading || scope.loading}
      generated={generated}
      onGenerate={generate}
      generatedBy={scope.generatedBy}
      fileName={`travel-expense-${from}-to-${to}.pdf`}
      summary={summary}
      defaultCharts={[
        {
          id: "km-member",
          title: "KM Travelled by Team Member",
          type: "hbar",
          groupBy: "full_name",
          measure: "km",
          aggregate: "sum",
          topN: 10,
        },
        {
          id: "amount-date",
          title: "Travel Expense by Date",
          type: "line",
          groupBy: "activity_date",
          measure: "amount",
          aggregate: "sum",
        },
        {
          id: "km-type",
          title: "KM by Activity Type",
          type: "bar",
          groupBy: "activity_type",
          measure: "km",
          aggregate: "sum",
        },
        {
          id: "km-outcome",
          title: "Travel Expense by Outcome",
          type: "pie",
          groupBy: "outcome",
          measure: "amount",
          aggregate: "sum",
        },
      ]}
      filterState={{ ...state, employee, actType, outcome, status }}
      onApplyFilterState={(s) => {
        patch({
          field: (s['field'] as string) || state.field,
          preset: (s['preset'] as PresetKey) || state.preset,
          customFrom: (s['customFrom'] as string) || state.customFrom,
          customTo: (s['customTo'] as string) || state.customTo,
        });
        setEmployee((s['employee'] as string) || "all");
        setActType((s['actType'] as string) || "all");
        setOutcome((s['outcome'] as string) || "all");
        setStatus((s['status'] as string) || "all");
      }}
      filterSummary={[
        `${fieldLabel}: ${presetLabel(state.preset)} (${from} to ${to})`,
        `Team Member: ${employee === "all" ? "All" : scope.users.find((u) => u.id === employee)?.full_name || "-"}`,
        `Activity Type: ${actType === "all" ? "All" : actType}`,
        `Outcome: ${outcome === "all" ? "All" : outcome}`,
        `Status: ${status === "all" ? "All" : status}`,
        `TA Rate: date-effective (current ${inr(taRates.length ? rateForDate(taRates, new Date().toISOString().slice(0, 10)) : rate)}/km)`,
      ]}
      filters={
        <>
          <DateScopeFilter
            module="travel-expense"
            fields={DATE_FIELDS}
            state={state}
            onChange={patch}
            from={from}
            to={to}
          />
          <SelectField
            label="Team Member"
            value={employee}
            onChange={setEmployee}
            allLabel="All Team Members"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <SelectField
            label="Activity Type"
            value={actType}
            onChange={setActType}
            allLabel="All Types"
            options={actTypes}
          />
          <SelectField
            label="Outcome"
            value={outcome}
            onChange={setOutcome}
            allLabel="All Outcomes"
            options={outcomes.map((o) => ({ value: o.name, label: o.name }))}
          />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
        </>
      }
    />
  );
}
