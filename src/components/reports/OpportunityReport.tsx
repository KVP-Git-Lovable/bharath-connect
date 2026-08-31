import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { format, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SelectField, DateScopeFilter } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { ReportWorkspace } from "./ReportWorkspace";
import type { ReportColumn } from "./reportTypes";
import { DateFieldOption, PresetKey, presetLabel, useDateScope } from "./dateScope";
import { formatCurrency } from "@/lib/currency";
import {
  DEFAULT_OPP_SCORING,
  useOpportunityScoringRules,
  qualificationLevel,
  BudgetStatus,
  AuthorityRole,
  NeedLevel,
  TimelineTier,
} from "@/hooks/useOpportunityScoring";

const DATE_FIELDS: DateFieldOption[] = [
  { value: "close_date", label: "Expected Close Date" },
  { value: "created_at", label: "Created Date", timestamp: true },
  { value: "updated_at", label: "Last Modified Date", timestamp: true },
  { value: "stage_changed_at", label: "Stage Changed Date", timestamp: true },
];

const PROBABILITY_BANDS = [
  { value: "0-25", label: "0 - 25%" },
  { value: "26-50", label: "26 - 50%" },
  { value: "51-75", label: "51 - 75%" },
  { value: "76-100", label: "76 - 100%" },
];

const SLA_OPTIONS = [
  { value: "met", label: "SLA Met" },
  { value: "missed", label: "SLA Missed" },
  { value: "pending", label: "SLA Pending" },
  { value: "none", label: "No SLA / Not from lead" },
];

interface Row {
  id: string;
  name: string;
  customer: string;
  customer_id: string | null;
  owner: string;
  stage: string;
  type: string;
  amount: number;
  currency: string;
  amount_text: string;
  weighted: number;
  weighted_text: string;
  probability: number;
  close_date: string | null;
  days_to_close: number | null;
  requirements: string;
  bant_score: number;
  bant_level: string;
  budget: string;
  authority: string;
  need: string;
  timeline: string;
  sla_status: string;
  sla_days: number | null;
  created_at: string;
}

const label = (v?: string | null) =>
  v ? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";

const bantBadge = (level: string) => {
  const map: Record<string, string> = {
    High: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    Medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    Low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return <Badge className={map[level] || "bg-muted text-muted-foreground"}>{level}</Badge>;
};

const slaBadge = (s: string) => {
  const map: Record<string, string> = {
    "SLA Met": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    "SLA Missed": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    "SLA Pending": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s}</Badge>;
};

export default function OpportunityReport() {
  const scope = useReportScope();
  const { state, patch, from, to } = useDateScope("opportunities", "close_date");
  const { rules } = useOpportunityScoringRules();
  const [owner, setOwner] = useState("all");
  const [stage, setStage] = useState("all");
  const [type, setType] = useState("all");
  const [band, setBand] = useState("all");
  const [sla, setSla] = useState("all");
  const [stages, setStages] = useState<{ value: string; label: string }[]>([]);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("opportunity_stages")
      .select("name, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setStages((data || []).map((s) => ({ value: s.name, label: s.name }))));
    supabase
      .from("opportunity_types")
      .select("name, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setTypes((data || []).map((t) => ({ value: t.name, label: t.name }))));
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("customer_opportunities")
        .select(
          "id, name, customer_id, stage, type, probability, close_date, amount, currency, owner_id, requirements_highlights, budget_status, authority_role, need_level, timeline, created_at, updated_at, stage_changed_at"
        )
        .order("close_date", { ascending: true });

      if (state.field === "close_date") {
        q = q.gte("close_date", from).lte("close_date", to);
      } else {
        q = q.gte(state.field, `${from}T00:00:00`).lte(state.field, `${to}T23:59:59`);
      }

      if (owner !== "all") q = q.eq("owner_id", owner);
      else if (scope.userIds)
        q = q.in("owner_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (stage !== "all") q = q.eq("stage", stage);
      if (type !== "all") q = q.eq("type", type);

      const { data, error } = await q;
      if (error) throw error;

      const custIds = Array.from(new Set((data || []).map((r) => r.customer_id).filter(Boolean))) as string[];
      const custMap = new Map<string, string>();
      const leadSla = new Map<string, { target: string | null; actual: string | null }>();
      if (custIds.length) {
        const [{ data: custs }, { data: leadRows }] = await Promise.all([
          supabase.from("customers").select("id, name").in("id", custIds),
          supabase
            .from("leads")
            .select("converted_customer_id, target_first_contact_date, actual_first_contact_date")
            .in("converted_customer_id", custIds),
        ]);
        (custs || []).forEach((c) => custMap.set(c.id, c.name));
        (leadRows || []).forEach((l) => {
          if (l.converted_customer_id)
            leadSla.set(l.converted_customer_id, {
              target: l.target_first_contact_date,
              actual: l.actual_first_contact_date,
            });
        });
      }

      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      const scoring = rules || DEFAULT_OPP_SCORING;
      const today = new Date();

      const mapped: Row[] = (data || []).map((r) => {
        const amount = Number(r.amount || 0);
        const probability = Number(r.probability || 0);
        const weighted = (amount * probability) / 100;
        const budget = (r.budget_status || "unknown") as BudgetStatus;
        const authority = (r.authority_role || "unknown") as AuthorityRole;
        const need = (r.need_level || "unclear") as NeedLevel;
        const timeline = (r.timeline || "unclear") as TimelineTier;
        const bant =
          (scoring.budget[budget] ?? 0) +
          (scoring.authority[authority] ?? 0) +
          (scoring.need[need] ?? 0) +
          (scoring.timeline[timeline] ?? 0);

        const s = r.customer_id ? leadSla.get(r.customer_id) : undefined;
        let slaStatus = "No SLA";
        let slaDays: number | null = null;
        if (s?.target) {
          if (s.actual) {
            slaDays = differenceInCalendarDays(new Date(s.actual), new Date(s.target));
            slaStatus = slaDays <= 0 ? "SLA Met" : "SLA Missed";
          } else {
            slaDays = differenceInCalendarDays(today, new Date(s.target));
            slaStatus = slaDays > 0 ? "SLA Missed" : "SLA Pending";
          }
        }

        return {
          id: r.id,
          name: r.name,
          customer: r.customer_id ? custMap.get(r.customer_id) || "-" : "-",
          customer_id: r.customer_id,
          owner: r.owner_id ? nameMap.get(r.owner_id) || "-" : "-",
          stage: r.stage || "-",
          type: r.type || "-",
          amount,
          currency: r.currency || "INR",
          amount_text: formatCurrency(amount, r.currency),
          weighted,
          weighted_text: formatCurrency(weighted, r.currency),
          probability,
          close_date: r.close_date,
          days_to_close: r.close_date ? differenceInCalendarDays(new Date(r.close_date), today) : null,
          requirements: r.requirements_highlights || "-",
          bant_score: bant,
          bant_level: qualificationLevel(bant, scoring),
          budget: label(r.budget_status),
          authority: label(r.authority_role),
          need: label(r.need_level),
          timeline: label(r.timeline),
          sla_status: slaStatus,
          sla_days: slaDays,
          created_at: r.created_at,
        };
      });

      setRows(
        mapped.filter((r) => {
          if (band !== "all") {
            const [lo, hi] = band.split("-").map(Number);
            if (r.probability < lo || r.probability > hi) return false;
          }
          if (sla !== "all") {
            const want =
              sla === "met" ? "SLA Met" : sla === "missed" ? "SLA Missed" : sla === "pending" ? "SLA Pending" : "No SLA";
            if (r.sla_status !== want) return false;
          }
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
        header: "Opportunity",
        value: (r) => r.name,
        render: (r) => <span className="font-medium block max-w-[180px] truncate">{r.name}</span>,
        pdfWidth: 2.6,
      },
      {
        key: "customer",
        header: "Customer",
        value: (r) => r.customer,
        render: (r) => <span className="block max-w-[150px] truncate">{r.customer}</span>,
        pdfWidth: 2.2,
      },
      { key: "owner", header: "Owner", value: (r) => r.owner, pdfWidth: 2 },
      { key: "stage", header: "Stage", value: (r) => r.stage, pdfWidth: 1.8 },
      {
        key: "amount",
        header: "Value",
        value: (r) => r.amount,
        numeric: true,
        align: "right",
        render: (r) => r.amount_text,
        pdfWidth: 1.8,
      },
      {
        key: "probability",
        header: "Win %",
        value: (r) => r.probability,
        numeric: true,
        align: "right",
        render: (r) => `${r.probability}%`,
        pdfWidth: 1,
      },
      {
        key: "weighted",
        header: "Weighted Value",
        value: (r) => Math.round(r.weighted),
        numeric: true,
        align: "right",
        render: (r) => r.weighted_text,
        pdfWidth: 1.8,
      },
      {
        key: "close_date",
        header: "Close Date",
        value: (r) => (r.close_date ? format(new Date(r.close_date), "dd MMM yyyy") : "-"),
        pdfWidth: 1.7,
      },
      {
        key: "days_to_close",
        header: "Days To Close",
        value: (r) => r.days_to_close ?? 0,
        numeric: true,
        align: "right",
        render: (r) => (r.days_to_close == null ? "--" : r.days_to_close),
        pdfWidth: 1.3,
        defaultHidden: true,
      },
      {
        key: "requirements",
        header: "Requirement Highlights",
        value: (r) => r.requirements,
        render: (r) => <span className="block max-w-[240px] truncate">{r.requirements}</span>,
        pdfWidth: 3.2,
      },
      {
        key: "bant_score",
        header: "BANT Score",
        value: (r) => r.bant_score,
        numeric: true,
        align: "right",
        pdfWidth: 1.2,
      },
      {
        key: "bant_level",
        header: "Qualification",
        value: (r) => r.bant_level,
        render: (r) => bantBadge(r.bant_level),
        pdfWidth: 1.4,
      },
      { key: "budget", header: "Budget", value: (r) => r.budget, pdfWidth: 1.5, defaultHidden: true },
      { key: "authority", header: "Authority", value: (r) => r.authority, pdfWidth: 1.8, defaultHidden: true },
      { key: "need", header: "Need", value: (r) => r.need, pdfWidth: 1.4, defaultHidden: true },
      { key: "timeline", header: "Timeline", value: (r) => r.timeline, pdfWidth: 1.6, defaultHidden: true },
      {
        key: "sla_status",
        header: "Lead SLA",
        value: (r) => r.sla_status,
        render: (r) => slaBadge(r.sla_status),
        pdfWidth: 1.6,
      },
      {
        key: "sla_days",
        header: "SLA Variance (days)",
        value: (r) => r.sla_days ?? 0,
        numeric: true,
        align: "right",
        render: (r) => (r.sla_days == null ? "--" : r.sla_days),
        pdfWidth: 1.5,
        defaultHidden: true,
      },
      { key: "type", header: "Type", value: (r) => r.type, pdfWidth: 1.6, defaultHidden: true },
    ],
    []
  );

  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const weighted = rows.reduce((s, r) => s + r.weighted, 0);
    const avgProb = rows.length ? rows.reduce((s, r) => s + r.probability, 0) / rows.length : 0;
    const highBant = rows.filter((r) => r.bant_level === "High").length;
    const slaMissed = rows.filter((r) => r.sla_status === "SLA Missed").length;
    const cur = rows[0]?.currency || "INR";
    return [
      { label: "Opportunities", value: String(rows.length) },
      { label: "Pipeline Value", value: formatCurrency(total, cur) },
      { label: "Weighted Pipeline", value: formatCurrency(weighted, cur) },
      { label: "Avg Win Probability", value: `${avgProb.toFixed(0)}%` },
      { label: "High BANT", value: String(highBant) },
      { label: "Lead SLA Missed", value: String(slaMissed) },
    ];
  }, [rows]);

  const fieldLabel = DATE_FIELDS.find((f) => f.value === state.field)?.label || state.field;

  return (
    <ReportWorkspace
      module="opportunities"
      title="Opportunity Pipeline Report"
      description="Pipeline value, expected close dates, win probability, requirement highlights, BANT score and lead SLA."
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowLink={(r) => `/opportunities/${r.id}`}
      loading={loading || scope.loading}
      generated={generated}
      onGenerate={generate}
      generatedBy={scope.generatedBy}
      fileName={`opportunity-pipeline-${from}-to-${to}.pdf`}
      summary={summary}
      defaultCharts={[
        {
          id: "pipeline-stage",
          title: "Pipeline Value by Stage",
          type: "bar",
          groupBy: "stage",
          measure: "amount",
          aggregate: "sum",
        },
        {
          id: "weighted-owner",
          title: "Weighted Value by Owner",
          type: "hbar",
          groupBy: "owner",
          measure: "weighted",
          aggregate: "sum",
          topN: 10,
        },
        {
          id: "bant-mix",
          title: "BANT Qualification Mix",
          type: "pie",
          groupBy: "bant_level",
          measure: "count",
        },
        {
          id: "bant-stage",
          title: "Average BANT Score by Stage",
          type: "bar",
          groupBy: "stage",
          measure: "bant_score",
          aggregate: "avg",
        },
        {
          id: "sla-mix",
          title: "Lead SLA Status",
          type: "pie",
          groupBy: "sla_status",
          measure: "count",
        },
      ]}
      filterState={{ ...state, owner, stage, type, band, sla }}
      onApplyFilterState={(s) => {
        patch({
          field: (s.field as string) || state.field,
          preset: (s.preset as PresetKey) || state.preset,
          customFrom: (s.customFrom as string) || state.customFrom,
          customTo: (s.customTo as string) || state.customTo,
        });
        setOwner((s.owner as string) || "all");
        setStage((s.stage as string) || "all");
        setType((s.type as string) || "all");
        setBand((s.band as string) || "all");
        setSla((s.sla as string) || "all");
      }}
      filterSummary={[
        `${fieldLabel}: ${presetLabel(state.preset)} (${from} to ${to})`,
        `Owner: ${owner === "all" ? "All" : scope.users.find((u) => u.id === owner)?.full_name || "-"}`,
        `Stage: ${stage === "all" ? "All" : stage}`,
        `Type: ${type === "all" ? "All" : type}`,
        `Win Probability: ${band === "all" ? "All" : PROBABILITY_BANDS.find((b) => b.value === band)?.label || band}`,
        `Lead SLA: ${sla === "all" ? "All" : SLA_OPTIONS.find((o) => o.value === sla)?.label || sla}`,
      ]}
      filters={
        <>
          <DateScopeFilter
            module="opportunities"
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
          <SelectField label="Stage" value={stage} onChange={setStage} allLabel="All Stages" options={stages} />
          <SelectField label="Type" value={type} onChange={setType} allLabel="All Types" options={types} />
          <SelectField
            label="Win Probability"
            value={band}
            onChange={setBand}
            allLabel="All Probabilities"
            options={PROBABILITY_BANDS}
          />
          <SelectField label="Lead SLA" value={sla} onChange={setSla} allLabel="All SLA States" options={SLA_OPTIONS} />
        </>
      }
    />
  );
}
