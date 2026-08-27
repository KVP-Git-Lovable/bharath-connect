import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, TrendingUp, CalendarClock, CheckCircle2, Activity, X } from "lucide-react";
import { useLeads, useLeadStatuses, statusColorClasses } from "@/hooks/useLeadsEvents";
import { LeadForm } from "@/components/leads/LeadForm";
import { useLeadScoringRules } from "@/hooks/useLeadScoring";
import { useLeadsInsights, bantScore, BANT_LEVEL_CLASSES, SLA_BADGE_CLASSES } from "@/hooks/useLeadInsights";
import {
  format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subWeeks, subMonths, startOfQuarter, endOfQuarter, subQuarters, isWithinInterval,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { buildLeadRollups, EMPTY_ROLLUP } from "@/lib/leadActivityRollups";
import { ColumnPicker } from "@/components/reports/ColumnPicker";
import { SavedReportBar } from "@/components/reports/SavedReportBar";
import type { ReportColumn, SavedReport } from "@/components/reports/reportTypes";

const DATE_PRESETS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "current_month", label: "Current month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "current_fy", label: "Current FY" },
];

function presetRange(preset: string): { start: Date; end: Date } | null {
  const now = new Date();
  switch (preset) {
    case "today": return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
    case "this_week": return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "last_week": {
      const d = subWeeks(now, 1);
      return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) };
    }
    case "current_month": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_month": {
      const d = subMonths(now, 1);
      return { start: startOfMonth(d), end: endOfMonth(d) };
    }
    case "this_quarter": return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "last_quarter": {
      const d = subQuarters(now, 1);
      return { start: startOfQuarter(d), end: endOfQuarter(d) };
    }
    case "current_fy": {
      // Indian FY: 1 Apr – 31 Mar
      const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      return { start: new Date(y, 3, 1, 0, 0, 0), end: new Date(y + 1, 2, 31, 23, 59, 59) };
    }
    default: return null;
  }
}

function inRange(value?: string | null, range?: { start: Date; end: Date } | null) {
  if (!range) return true;
  if (!value) return false;
  const d = new Date(value);
  if (isNaN(d.getTime())) return false;
  return isWithinInterval(d, range);
}

/** Activities recorded against leads — used for the completed KPIs and roll-ups */
function useLeadActivityStats() {
  return useQuery({
    queryKey: ["lead-activity-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_events")
        .select("id, status, outcome, activity_date, lead_id")
        .not("lead_id", "is", null);
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 60 * 1000,
  });
}


function KpiCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <Card><CardContent className="p-4 min-h-[120px] flex flex-col justify-between">
      <div className="flex items-start gap-2 mb-2">
        <div className={`p-2 rounded-lg shrink-0 ${color}`}><Icon className="h-4 w-4 md:h-5 md:w-5" /></div>
        <div className="text-xs md:text-sm text-muted-foreground font-medium line-clamp-2">{label}</div>
      </div>
      <div className="space-y-1">
        <div className="text-lg md:text-2xl font-bold break-words">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </CardContent></Card>
  );
}

export default function Leads() {
  const nav = useNavigate();
  const { data: leads = [] } = useLeads();
  const { data: statuses = [] } = useLeadStatuses(false);
  const { data: leadActivities = [] } = useLeadActivityStats();
  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);

  const [q, setQ] = useState("");
  const [leadOpen, setLeadOpen] = useState(false);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [createdPreset, setCreatedPreset] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [minProductive, setMinProductive] = useState("");
  const [minDaysSince, setMinDaysSince] = useState("");

  // Activity & effort roll-ups per lead
  const rollups = useMemo(() => buildLeadRollups(leadActivities), [leadActivities]);
  const rollupOf = (id: string) => rollups[id] ?? EMPTY_ROLLUP;


  useEffect(() => {
    const ids = Array.from(
      new Set(leads.flatMap((l) => [l.created_by, (l as any).owner_id]).filter(Boolean)),
    ) as string[];
    const missing = ids.filter((id) => !userMap[id]);
    if (!missing.length) return;
    (async () => {
      const { data: usrs } = await supabase.from("users").select("id, full_name, username, email").in("id", missing);
      const map: Record<string, string> = {};
      (usrs ?? []).forEach((u: any) => { map[u.id] = u.full_name || u.username || u.email || ""; });
      const remaining = missing.filter((id) => !map[id]);
      if (remaining.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, username").in("id", remaining);
        (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name || p.username || ""; });
      }
      setUserMap((prev) => ({ ...prev, ...map }));
    })();
  }, [leads, userMap]);

  const ownerOf = (l: any) => (l.owner_id || l.created_by || null) as string | null;

  const ownerOptions = useMemo(() => {
    const ids = Array.from(new Set(leads.map(ownerOf).filter(Boolean))) as string[];
    return ids.map((id) => ({ id, name: userMap[id] || "Unknown" })).sort((a, b) => a.name.localeCompare(b.name));
  }, [leads, userMap]);

  const createdRange = useMemo(() => presetRange(createdPreset), [createdPreset]);

  const filteredLeads = useMemo(() => leads.filter((l: any) => {
    if (q && ![l.name, l.company, l.email, l.phone].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase()))) return false;
    if (!inRange(l.created_at, createdRange)) return false;
    if (ownerFilter !== "all" && ownerOf(l) !== ownerFilter) return false;
    if (statusFilter !== "all" && l.lead_status_id !== statusFilter) return false;
    const ru = rollups[l.id] ?? EMPTY_ROLLUP;
    if (minProductive !== "" && ru.productiveCount < Number(minProductive)) return false;
    if (minDaysSince !== "" && (ru.daysSinceLastActivity == null || ru.daysSinceLastActivity < Number(minDaysSince))) return false;
    return true;
  }), [leads, q, createdRange, ownerFilter, statusFilter, rollups, minProductive, minDaysSince]);

  const activeFilters =
    [createdPreset, ownerFilter, statusFilter].filter((v) => v !== "all").length +
    [minProductive, minDaysSince].filter((v) => v !== "").length;

  const clearAllFilters = () => {
    setCreatedPreset("all"); setOwnerFilter("all"); setStatusFilter("all");
    setMinProductive(""); setMinDaysSince("");
  };

  const filterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    const presetLabel = (v: string) => DATE_PRESETS.find((p) => p.value === v)?.label ?? v;
    if (createdPreset !== "all") chips.push({ key: "created", label: `Created: ${presetLabel(createdPreset)}`, clear: () => setCreatedPreset("all") });
    if (ownerFilter !== "all") chips.push({ key: "owner", label: `Owner: ${ownerOptions.find((o) => o.id === ownerFilter)?.name ?? "Unknown"}`, clear: () => setOwnerFilter("all") });
    if (statusFilter !== "all") chips.push({ key: "status", label: `Status: ${statusMap[statusFilter]?.name ?? "Unknown"}`, clear: () => setStatusFilter("all") });
    if (minProductive !== "") chips.push({ key: "prod", label: `Productive ≥ ${minProductive}`, clear: () => setMinProductive("") });
    if (minDaysSince !== "") chips.push({ key: "days", label: `Days since activity ≥ ${minDaysSince}`, clear: () => setMinDaysSince("") });
    return chips;
  }, [createdPreset, ownerFilter, statusFilter, minProductive, minDaysSince, ownerOptions, statusMap]);

  // Progressive rendering for large lists
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [q, createdPreset, ownerFilter, statusFilter, minProductive, minDaysSince]);

  const visibleLeads = useMemo(() => filteredLeads.slice(0, visibleCount), [filteredLeads, visibleCount]);
  const { rules: scoringRules } = useLeadScoringRules();
  const visibleIds = useMemo(() => visibleLeads.map((l: any) => l.id), [visibleLeads]);
  const { data: insights = {} } = useLeadsInsights(visibleIds);
  const hasMore = visibleCount < filteredLeads.length;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, filteredLeads.length]);

  const kpis = useMemo(() => {
    const now = new Date();
    const monthRange = { start: startOfMonth(now), end: endOfMonth(now) };
    const weekRange = { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };

    const pipeline = filteredLeads.reduce((s: number, l: any) => s + (Number(l.opportunity_value) || 0), 0);
    const closingLeads = filteredLeads.filter((l: any) => inRange(l.opportunity_close_date, monthRange));
    const closingValue = closingLeads.reduce((s: number, l: any) => s + (Number(l.opportunity_value) || 0), 0);

    const leadIds = new Set(filteredLeads.map((l: any) => l.id));
    const completed = leadActivities.filter((a) => a.status === "completed" && leadIds.has(a.lead_id));
    const completedMonth = completed.filter((a) => inRange(a.activity_date, monthRange)).length;
    const completedWeek = completed.filter((a) => inRange(a.activity_date, weekRange)).length;

    return { pipeline, closingCount: closingLeads.length, closingValue, completedMonth, completedWeek };
  }, [filteredLeads, leadActivities]);

  const money = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0, notation: n >= 100000 ? "compact" : "standard" }).format(n || 0);

  // ---- Configurable list columns (fields to display) ----
  const listColumns: ReportColumn<any>[] = useMemo(() => [
    {
      key: "name", header: "Name", value: (l) => l.name,
      render: (l) => (
        <span className="font-medium">
          {l.name}
          {l.converted_customer_id && <Badge variant="secondary" className="ml-2">Converted</Badge>}
        </span>
      ),
    },
    { key: "designation", header: "Designation", value: (l) => l.designation ?? l.title ?? "—" },
    { key: "company", header: "Company", value: (l) => l.company ?? "—" },
    {
      key: "status", header: "Status", value: (l) => (l.lead_status_id ? statusMap[l.lead_status_id]?.name ?? "—" : "—"),
      render: (l) => {
        const st = l.lead_status_id ? statusMap[l.lead_status_id] : null;
        return st ? <Badge className={statusColorClasses(st.color)}>{st.name}</Badge> : <>—</>;
      },
    },
    { key: "owner", header: "Owner", value: (l) => (ownerOf(l) ? userMap[ownerOf(l) as string] || "—" : "—") },
    {
      key: "value", header: "Opp. Value", align: "right", numeric: true,
      value: (l) => Number(l.opportunity_value) || 0,
      render: (l) => <>{Number(l.opportunity_value) > 0 ? money(Number(l.opportunity_value)) : "—"}</>,
    },
    {
      key: "close_date", header: "Close Date",
      value: (l) => (l.opportunity_close_date ? format(new Date(l.opportunity_close_date), "dd MMM yyyy") : "—"),
    },
    {
      key: "probability", header: "Win %", align: "right", numeric: true,
      value: (l) => (l.opportunity_probability != null ? Number(l.opportunity_probability) : null),
      render: (l) => <>{l.opportunity_probability != null ? `${l.opportunity_probability}%` : "—"}</>,
    },
    {
      key: "productive_count", header: "# Productive Activities", align: "right", numeric: true,
      value: (l) => rollupOf(l.id).productiveCount,
    },
    {
      key: "days_since_last_activity", header: "Days Since Last Activity", align: "right", numeric: true,
      value: (l) => rollupOf(l.id).daysSinceLastActivity,
      render: (l) => <>{rollupOf(l.id).daysSinceLastActivity ?? "—"}</>,
    },
    {
      key: "next_activity_date", header: "Next Activity Date",
      value: (l) => {
        const d = rollupOf(l.id).nextActivityDate;
        return d ? format(new Date(d), "dd MMM yyyy") : "—";
      },
    },
    {
      key: "activity_count", header: "# Activities", align: "right", numeric: true, defaultHidden: true,
      value: (l) => rollupOf(l.id).activityCount,
    },
    {
      key: "last_activity_date", header: "Last Activity Date", defaultHidden: true,
      value: (l) => {
        const d = rollupOf(l.id).lastActivityDate;
        return d ? format(new Date(d), "dd MMM yyyy") : "—";
      },
    },
    { key: "phone", header: "Phone", value: (l) => l.phone ?? "—", defaultHidden: true },
    { key: "email", header: "Email", value: (l) => l.email ?? "—", defaultHidden: true },
    { key: "created_at", header: "Created", value: (l) => format(new Date(l.created_at), "dd MMM yyyy"), defaultHidden: true },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [statusMap, userMap, rollups]);

  const [visibleCols, setVisibleCols] = useState<string[]>([]);
  useEffect(() => {
    if (visibleCols.length) return;
    setVisibleCols(listColumns.filter((c) => !c.defaultHidden).map((c) => c.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listColumns]);
  const shownCols = useMemo(
    () => listColumns.filter((c) => visibleCols.includes(c.key)),
    [listColumns, visibleCols],
  );

  // Saved views (same storage as saved reports, scoped to the leads list)
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [activeViewName, setActiveViewName] = useState<string | null>(null);
  const applyView = (r: SavedReport) => {
    const f = (r.config.filters || {}) as Record<string, unknown>;
    setCreatedPreset((f.createdPreset as string) || "all");
    setOwnerFilter((f.ownerFilter as string) || "all");
    setStatusFilter((f.statusFilter as string) || "all");
    setMinProductive((f.minProductive as string) ?? "");
    setMinDaysSince((f.minDaysSince as string) ?? "");
    if (r.config.visibleColumns?.length) {
      setVisibleCols(r.config.visibleColumns.filter((k) => listColumns.some((c) => c.key === k)));
    }
    setActiveViewId(r.id);
    setActiveViewName(r.name);
  };


  return (
    <motion.div className="p-3 md:p-6 space-y-4 max-w-7xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Leads</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Capture and convert leads into customers</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <KpiCard icon={TrendingUp} label="Total Opportunity Pipeline" value={money(kpis.pipeline)} sub={`${filteredLeads.length} leads`} color="bg-blue-100 text-blue-600" />
        <KpiCard icon={CalendarClock} label="Closing This Month" value={money(kpis.closingValue)} sub={`${kpis.closingCount} leads`} color="bg-amber-100 text-amber-600" />
        <KpiCard icon={CheckCircle2} label="Activities Completed (Month)" value={kpis.completedMonth} color="bg-emerald-100 text-emerald-600" />
        <KpiCard icon={Activity} label="Activities Completed (Week)" value={kpis.completedWeek} color="bg-purple-100 text-purple-600" />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 md:flex-none">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-full md:w-56" />
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setLeadOpen(true)}><Plus className="h-4 w-4 mr-1" />New Lead</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SavedReportBar
              module="leads-list"
              currentConfig={{
                filters: { createdPreset, ownerFilter, statusFilter, minProductive, minDaysSince },
                visibleColumns: visibleCols,
              }}
              activeId={activeViewId}
              activeName={activeViewName}
              onApply={applyView}
              onSaved={(id, name) => { setActiveViewId(id); setActiveViewName(name); }}
              onCleared={() => { setActiveViewId(null); setActiveViewName(null); }}
            />
            <ColumnPicker columns={listColumns} visible={visibleCols} onChange={setVisibleCols} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">

            <Select value={createdPreset} onValueChange={setCreatedPreset}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Created date" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.value === "all" ? "Created: All time" : `Created: ${p.label}`}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="h-9 text-xs"
              placeholder="Min # productive activities"
              value={minProductive}
              onChange={(e) => setMinProductive(e.target.value)}
            />
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="h-9 text-xs"
              placeholder="Min days since last activity"
              value={minDaysSince}
              onChange={(e) => setMinDaysSince(e.target.value)}
            />

            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">All owners</SelectItem>
                {ownerOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {activeFilters > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {filterChips.map((c) => (
                  <button
                    key={c.key}
                    onClick={c.clear}
                    className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 px-2.5 py-1 text-[11px] font-medium text-secondary-foreground active:opacity-70"
                  >
                    <span className="max-w-[160px] truncate">{c.label}</span>
                    <X className="h-3 w-3 opacity-70" />
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{filteredLeads.length} result{filteredLeads.length !== 1 ? "s" : ""}</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAllFilters}>
                  <X className="h-3 w-3 mr-1" />Clear all
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {visibleLeads.map((l: any) => {
          const st = l.lead_status_id ? statusMap[l.lead_status_id] : null;
          const owner = ownerOf(l);
          const ownerName = owner ? (userMap[owner] || "—") : "—";
          const ins = (insights as any)[l.id] ?? { activityCount: 0, documentCount: 0, sla: "Not Started" };
          const score = bantScore(
            {
              statusName: st?.name, contactRole: l.contact_role,
              activityCount: ins.activityCount, createdAt: l.created_at,
              indicativeBudget: l.indicative_budget, opportunityValue: l.opportunity_value,
              requirement: l.researched_information, closeDate: l.opportunity_close_date,
            },
            scoringRules,
          );
          return (
            <Card key={l.id} className="cursor-pointer active:opacity-80" onClick={() => nav(`/leads/${l.id}`)}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{l.name}</p>
                    {l.company && <p className="text-xs text-muted-foreground truncate">{l.company}</p>}
                  </div>
                  {st && <Badge className={`${statusColorClasses(st.color)} shrink-0 text-[10px]`}>{st.name}</Badge>}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{l.phone ?? "No phone"}</span>
                  <span className="shrink-0">{format(new Date(l.created_at), "dd MMM yyyy")}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground truncate">Owner: {ownerName}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{ins.documentCount} doc{ins.documentCount === 1 ? "" : "s"}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Value</div>
                    <div className="text-[11px] font-semibold truncate">
                      {Number(l.opportunity_value) > 0 ? money(Number(l.opportunity_value)) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Close date</div>
                    <div className="text-[11px] font-semibold truncate">
                      {l.opportunity_close_date ? format(new Date(l.opportunity_close_date), "dd MMM yy") : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Win %</div>
                    <div className="text-[11px] font-semibold">
                      {l.opportunity_probability != null ? `${l.opportunity_probability}%` : "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className={`${BANT_LEVEL_CLASSES[score.level]} text-[10px]`}>BANT {score.total} · {score.level}</Badge>
                  <Badge className={`${SLA_BADGE_CLASSES[ins.sla]} text-[10px]`}>{ins.sla}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredLeads.length === 0 && (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No leads match the filters</CardContent></Card>
        )}
      </div>

      {/* Desktop: table */}
      <Card className="hidden md:block"><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            {shownCols.map((c) => (
              <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.header}</TableHead>
            ))}
          </TableRow></TableHeader>
          <TableBody>
            {visibleLeads.map((l: any) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => nav(`/leads/${l.id}`)}>
                {shownCols.map((c) => (
                  <TableCell key={c.key} className={`text-sm ${c.align === "right" ? "text-right" : ""}`}>
                    {c.render ? c.render(l) : (c.value(l) ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {filteredLeads.length === 0 && (
              <TableRow>
                <TableCell colSpan={Math.max(shownCols.length, 1)} className="text-center py-8 text-muted-foreground">
                  No leads match the filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent></Card>


      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-3">
          <span className="text-[11px] text-muted-foreground">
            Showing {visibleLeads.length} of {filteredLeads.length}
          </span>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            Load more
          </Button>
        </div>
      )}

      <LeadForm open={leadOpen} onOpenChange={setLeadOpen} />

    </motion.div>
  );
}
