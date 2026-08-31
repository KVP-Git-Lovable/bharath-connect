import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import {
  useLeads, useLeadStatuses, useLeadSources, useIndustries, statusColorClasses,
} from "@/hooks/useLeadsEvents";
import { LeadForm } from "@/components/leads/LeadForm";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildLeadRollups, EMPTY_ROLLUP } from "@/lib/leadActivityRollups";
import { toast } from "sonner";
import {
  applyFilters, sortRows, formatCell, fieldDef, DEFAULT_VIEW_COLUMNS,
  type ListDisplayMode, type ListView, type FilterCondition, type KanbanConfig,
} from "@/lib/leadFields";
import { getKanbanConfig, setKanbanConfig, isStandardViewId } from "@/lib/leadStandardViews";
import { useLeadListViews } from "@/hooks/useLeadListViews";
import ViewBar from "@/components/leads/listviews/ViewBar";
import ViewEditorDialog from "@/components/leads/listviews/ViewEditorDialog";
import ViewFiltersPanel from "@/components/leads/listviews/ViewFiltersPanel";
import ViewChartsPanel from "@/components/leads/listviews/ViewChartsPanel";
import FieldsDisplayDialog from "@/components/leads/listviews/FieldsDisplayDialog";
import KanbanSettingsDialog from "@/components/leads/listviews/KanbanSettingsDialog";
import LeadListViewTable from "@/components/leads/listviews/LeadListViewTable";
import LeadKanban from "@/components/leads/listviews/LeadKanban";
import LeadSplitView from "@/components/leads/listviews/LeadSplitView";
import { LeadAvatar } from "@/components/leads/listviews/LeadAvatar";

const SECTION = "leads";




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


/** Columns that can be written straight back to the leads table. */
const DIRECT_COLUMNS: Record<string, string> = {
  name: "name",
  title: "title",
  company: "company",
  phone: "phone",
  email: "email",
  website: "website",
  address: "address",
  industry: "industry",
  contact_role: "contact_role",
  researched_information: "researched_information",
  opportunity_value: "opportunity_value",
  opportunity_probability: "opportunity_probability",
  opportunity_close_date: "opportunity_close_date",
  indicative_budget: "indicative_budget",
  target_first_contact_date: "target_first_contact_date",
  actual_first_contact_date: "actual_first_contact_date",
  target_conversion_date: "target_conversion_date",
};

export default function Leads() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: leads = [] } = useLeads();
  const { data: statuses = [] } = useLeadStatuses(false);
  const { data: sources = [] } = useLeadSources(false);
  const { data: industries = [] } = useIndustries(false);
  const { data: leadActivities = [] } = useLeadActivityStats();

  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);
  const sourceMap = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s])), [sources]);

  const [leadOpen, setLeadOpen] = useState(false);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [display, setDisplay] = useState<ListDisplayMode>("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<ListView | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const {
    allViews, loading, userId, activeView, selectView, saveView, saveCharts,
    deleteView, pinDefault, updateStandardColumns, updateStandardFilters, updateStandardCharts, reload,
  } = useLeadListViews(SECTION, "Leads");


  const rollups = useMemo(() => buildLeadRollups(leadActivities), [leadActivities]);

  useEffect(() => {
    const ids = Array.from(
      new Set(leads.flatMap((l: any) => [l.created_by, l.owner_id]).filter(Boolean)),
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

  /** Flatten leads into list-view rows keyed exactly like LEAD_FIELDS. */
  const rows = useMemo(() => leads.map((l: any) => {
    const ru = rollups[l.id] ?? EMPTY_ROLLUP;
    const ownerId = l.owner_id || l.created_by || null;
    return {
      ...l,
      status_name: l.lead_status_id ? statusMap[l.lead_status_id]?.name ?? "" : "",
      status_color: l.lead_status_id ? statusMap[l.lead_status_id]?.color ?? "" : "",
      source_name: l.lead_source_id ? sourceMap[l.lead_source_id]?.name ?? "" : "",
      owner_id: ownerId,
      owner_name: ownerId ? userMap[ownerId] || "" : "",
      created_by_name: l.created_by ? userMap[l.created_by] || "" : "",
      activity_count: ru.activityCount,
      productive_count: ru.productiveCount,
      days_since_last_activity: ru.daysSinceLastActivity,
      total_effort_hours: (ru as any).totalEffortHours ?? 0,
      last_activity_date: ru.lastActivityDate,
      next_activity_date: ru.nextActivityDate,
      converted_label: l.converted_customer_id ? "Yes" : "No",
    };
  }), [leads, rollups, statusMap, sourceMap, userMap]);

  const picklistOptions = useMemo(() => {
    const opt = (vals: string[]) =>
      Array.from(new Set(vals.filter(Boolean))).sort().map((v) => ({ value: v, label: v }));
    return {
      status: statuses.map((s) => ({ value: s.name, label: s.name })),
      source: sources.map((s) => ({ value: s.name, label: s.name })),
      industry: industries.length
        ? industries.map((i) => ({ value: i.name, label: i.name }))
        : opt(rows.map((r: any) => r.industry)),
      owner: opt(rows.map((r: any) => r.owner_name)),
      contact_role: opt(rows.map((r: any) => r.contact_role)),
      converted: [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }],
    } as Record<string, { value: string; label: string }[]>;
  }, [statuses, sources, industries, rows]);

  const people = useMemo(
    () => Object.entries(userMap).map(([value, label]) => ({ value, label: label || "Unknown" })),
    [userMap],
  );

  const columns = activeView?.columns?.length ? activeView.columns : DEFAULT_VIEW_COLUMNS;

  const viewRows = useMemo(() => {
    let out = applyFilters(rows, activeView?.filters);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r: any) =>
        [r.name, r.company, r.email, r.phone, r.status_name, r.owner_name]
          .some((v) => String(v ?? "").toLowerCase().includes(q)));
    }
    const field = sortKey ?? activeView?.sort_field ?? "created_at";
    const dir = sortKey ? sortDir : activeView?.sort_dir ?? "desc";
    return sortRows(out, field, dir);
  }, [rows, activeView, search, sortKey, sortDir]);

  const [kanbanConfig, setKanbanConfigState] = useState<KanbanConfig>(() =>
    getKanbanConfig(SECTION, activeView?.id ?? "__all__"));
  useEffect(() => {
    setKanbanConfigState(getKanbanConfig(SECTION, activeView?.id ?? "__all__"));
  }, [activeView?.id]);

  const canManageActive = !!activeView && (activeView.is_standard || activeView.owner_id === userId);


  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const openLead = (row: any) => nav(`/leads/${row.id}`);

  const saveColumns = (cols: string[]) => {
    if (!activeView) return;
    if (activeView.is_standard) updateStandardColumns(activeView.id, cols);
    else saveView({ ...activeView, name: activeView.name, columns: cols });
  };

  const persistField = async (row: any, key: string, value: any) => {
    const patch: Record<string, any> = {};
    if (DIRECT_COLUMNS[key]) {
      const def = fieldDef(key);
      patch[DIRECT_COLUMNS[key]] =
        value === "" ? null : def?.type === "number" ? Number(value) : value;
    } else if (key === "status_name") {
      const st = statuses.find((s) => s.name === value);
      if (!st) return;
      patch.lead_status_id = st.id;
    } else if (key === "source_name") {
      const so = sources.find((s) => s.name === value);
      if (!so) return;
      patch.lead_source_id = so.id;
    } else {
      toast.error("This field can't be edited inline");
      return;
    }

    const { error } = await supabase.from("leads" as any).update(patch).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["leads"] });
    toast.success("Lead updated");
  };

  return (
    <motion.div className="p-3 md:p-6 space-y-4 max-w-7xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Leads</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Capture and convert leads into customers</p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setLeadOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />New Lead
        </Button>
      </div>


      <ViewBar
        views={allViews}
        activeView={activeView}
        currentUserId={userId}
        onSelect={selectView}
        onNew={() => { setEditingView(null); setEditorOpen(true); }}
        onEdit={(v) => { setEditingView(v); setEditorOpen(true); }}
        onDelete={deleteView}
        onPin={pinDefault}
        onClone={(v) => { setEditingView({ ...v, id: "", name: `${v.name} (copy)`, is_standard: false }); setEditorOpen(true); }}
        onFields={() => setFieldsOpen(true)}
        onRefresh={() => { reload(); qc.invalidateQueries({ queryKey: ["leads"] }); }}
        display={display}
        onDisplayChange={setDisplay}
        onKanbanSettings={() => setKanbanOpen(true)}
        count={viewRows.length}
        search={search}
        onSearchChange={setSearch}
        chartsOpen={chartsOpen}
        onToggleCharts={() => setChartsOpen((o) => !o)}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((o) => !o)}
      />

      <div className={filtersOpen || chartsOpen ? "grid gap-4 md:grid-cols-[1fr_340px]" : ""}>
        <Card className="overflow-hidden md:order-1">

          <CardContent className="p-0">
            {loading ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Loading views…</p>
            ) : viewRows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No leads match this view</p>
            ) : display === "table" ? (
              <LeadListViewTable
                rows={viewRows}
                columns={columns}
                selectedIds={selectedIds}
                onToggle={(id) => setSelectedIds((prev) => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                })}
                onToggleAll={() => setSelectedIds((prev) =>
                  prev.size === viewRows.length ? new Set() : new Set(viewRows.map((r: any) => r.id)))}
                onOpen={openLead}
                sortKey={sortKey ?? activeView?.sort_field ?? null}
                sortDir={sortKey ? sortDir : activeView?.sort_dir ?? "desc"}
                onSort={toggleSort}
                onInlineSave={persistField}
                picklistOptions={picklistOptions}
              />
            ) : display === "kanban" ? (
              <LeadKanban
                rows={viewRows}
                config={kanbanConfig}
                options={picklistOptions[fieldDef(kanbanConfig.group_field)?.optionsSource ?? "status"] ?? []}
                columns={columns}
                onOpen={openLead}
                onMove={(row, field, value) => persistField(row, field, value)}
              />
            ) : display === "split" ? (
              <LeadSplitView rows={viewRows} columns={columns} onOpen={openLead} />
            ) : (
              <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {viewRows.map((l: any) => (
                  <button
                    key={l.id}
                    onClick={() => openLead(l)}
                    className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-start gap-3">
                      <LeadAvatar name={l.name} className="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{l.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{l.company || "No company"}</p>
                      </div>
                      {l.status_name && (
                        <Badge className={`${statusColorClasses(l.status_color)} shrink-0 text-[10px]`}>{l.status_name}</Badge>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                      {columns.filter((c) => c !== "name").slice(0, 4).map((c) => (
                        <div key={c} className="truncate">
                          <span className="opacity-70">{fieldDef(c)?.label}: </span>
                          {formatCell(l, c)}
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Created {format(new Date(l.created_at), "dd MMM yyyy")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {(filtersOpen || chartsOpen) && (
          <div className="order-first space-y-4 md:order-2 md:sticky md:top-4 md:self-start">

            {filtersOpen && (
              <ViewFiltersPanel
                view={activeView}
                canManage={canManageActive}
                picklistOptions={picklistOptions}
                onSave={(filters: { match: "all" | "any"; conditions: FilterCondition[] }) => {
                  if (!activeView) return;
                  if (activeView.is_standard) updateStandardFilters(activeView.id, filters);
                  else saveView({ ...activeView, name: activeView.name, filters });
                }}
                onClose={() => setFiltersOpen(false)}
              />
            )}
            {chartsOpen && (
              <ViewChartsPanel
                charts={activeView?.charts ?? []}
                rows={viewRows}
                canManage={canManageActive}
                onChange={(charts) => {
                  if (!activeView) return;
                  if (activeView.is_standard) updateStandardCharts(activeView.id, charts);
                  else saveCharts(activeView.id, charts);
                }}
                onClose={() => setChartsOpen(false)}
              />
            )}

          </div>
        )}
      </div>

      <ViewEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        view={editingView}
        onSave={(payload) => saveView(payload as any)}
        picklistOptions={picklistOptions}
        people={people}
      />

      <FieldsDisplayDialog
        open={fieldsOpen}
        onOpenChange={setFieldsOpen}
        viewName={activeView?.name ?? "All Leads"}
        columns={columns}
        onSave={saveColumns}
      />

      <KanbanSettingsDialog
        open={kanbanOpen}
        onOpenChange={setKanbanOpen}
        config={kanbanConfig}
        onSave={(cfg) => {
          setKanbanConfigState(cfg);
          setKanbanConfig(SECTION, activeView?.id ?? "__all__", cfg);
        }}
      />

      <LeadForm open={leadOpen} onOpenChange={setLeadOpen} />
    </motion.div>
  );
}
