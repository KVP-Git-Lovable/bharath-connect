import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DEFAULT_VIEW_COLUMNS, type ListView } from "@/lib/leadFields";
import {
  ALL_VIEW_ID, buildStandardViews, isStandardViewId, setStandardColumns,
  setStandardFilters, setStandardCharts,
} from "@/lib/leadStandardViews";

const STORAGE_KEY = "leads.activeListView";


function normalize(row: any): ListView {
  const rawFilters = row.filters;
  const conditions = Array.isArray(rawFilters)
    ? rawFilters
    : Array.isArray(rawFilters?.conditions)
      ? rawFilters.conditions
      : [];
  return {
    id: row.id,
    name: row.name,
    owner_id: row.user_id,
    filters: {
      match: (row.filter_match === "any" ? "any" : "all") as "all" | "any",
      conditions,
    },
    columns: row.display_fields?.length ? row.display_fields : DEFAULT_VIEW_COLUMNS,
    sort_field: row.sort_by ?? "created_at",
    sort_dir: row.sort_direction === "asc" ? "asc" : "desc",
    visibility: (row.visibility ?? "private") as ListView["visibility"],
    shared_user_ids: row.shared_with ?? [],
    is_default: !!row.is_default,
    charts: Array.isArray(row.charts) ? row.charts : [],
  };
}


export function useLeadListViews(section = "leads", objectLabel = "Leads") {
  const [views, setViews] = useState<ListView[]>([]);
  const [standardViews, setStandardViews] = useState<ListView[]>(() => buildStandardViews(section, objectLabel));
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | undefined>();
  const [activeViewId, setActiveViewId] = useState<string | null>(ALL_VIEW_ID);
  const [initialised, setInitialised] = useState(false);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    setUserId(auth.user?.id);
    const { data, error } = await supabase
      .from("list_views")
      .select("*")
      .eq("section", section)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return [] as ListView[];
    }
    const list = (data || []).map(normalize);
    setViews(list);
    setLoading(false);
    return list;
  }, [section]);

  useEffect(() => {
    load().then((list) => {
      if (initialised) return;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isStandardViewId(stored)) {
        setActiveViewId(stored);
      } else if (stored && list.some((v) => v.id === stored)) {
        setActiveViewId(stored);
      } else {
        const pinned = list.find((v) => v.is_default);
        setActiveViewId(pinned ? pinned.id : ALL_VIEW_ID);
      }
      setInitialised(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const selectView = useCallback((id: string | null) => {
    const next = id ?? ALL_VIEW_ID;
    setActiveViewId(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const allViews = useMemo(() => [...standardViews, ...views], [standardViews, views]);

  const activeView = useMemo(
    () => allViews.find((v) => v.id === activeViewId) ?? allViews[0] ?? null,
    [allViews, activeViewId]
  );

  /** Standard views keep locked filters, but their displayed columns are user-configurable. */
  const updateStandardColumns = useCallback(
    (viewId: string, columns: string[]) => {
      setStandardColumns(section, viewId, columns);
      setStandardViews((prev) => prev.map((v) => (v.id === viewId ? { ...v, columns } : v)));
    },
    [section]
  );

  /** Standard-view filters/charts are personal, so they persist locally. */
  const updateStandardFilters = useCallback(
    (viewId: string, filters: ListView["filters"]) => {
      setStandardFilters(section, viewId, filters as any);
      setStandardViews((prev) => prev.map((v) => (v.id === viewId ? { ...v, filters } : v)));
    },
    [section]
  );

  const updateStandardCharts = useCallback(
    (viewId: string, charts: ListView["charts"]) => {
      setStandardCharts(section, viewId, charts as any);
      setStandardViews((prev) => prev.map((v) => (v.id === viewId ? { ...v, charts } : v)));
    },
    [section]
  );



  const saveView = useCallback(
    async (payload: Partial<ListView> & { name: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        toast.error("You must be signed in to save a view");
        return;
      }
      const record = {
        name: payload.name,
        section,
        user_id: uid,
        filters: (payload.filters?.conditions ?? []) as any,
        filter_match: payload.filters?.match ?? "all",
        display_fields: payload.columns?.length ? payload.columns : DEFAULT_VIEW_COLUMNS,
        sort_by: payload.sort_field ?? "created_at",
        sort_direction: payload.sort_dir ?? "desc",
        visibility: payload.visibility ?? "private",
        shared_with: payload.visibility === "selected" ? payload.shared_user_ids ?? [] : [],
        is_shared: (payload.visibility ?? "private") !== "private",
        is_default: payload.is_default ?? false,
        charts: (payload.charts ?? []) as any,
      };


      if (payload.id) {
        const { error } = await supabase
          .from("list_views")
          .update({ ...record, updated_at: new Date().toISOString() })
          .eq("id", payload.id);
        if (error) return toast.error(error.message);
        toast.success("View updated");
        await load();
        selectView(payload.id);
      } else {
        const { data, error } = await supabase.from("list_views").insert(record).select("id").single();
        if (error) return toast.error(error.message);
        toast.success("View created");
        await load();
        if (data?.id) selectView(data.id);
      }
    },
    [section, load, selectView]
  );

  const saveCharts = useCallback(
    async (viewId: string, charts: ListView["charts"]) => {
      // Charts live on the view row, so they inherit the view's sharing rules.
      setViews((prev) => prev.map((v) => (v.id === viewId ? { ...v, charts } : v)));
      const { error } = await supabase
        .from("list_views")
        .update({ charts: charts as any, updated_at: new Date().toISOString() })
        .eq("id", viewId);
      if (error) {
        toast.error(error.message);
        await load();
      }
    },
    [load]
  );

  const deleteView = useCallback(
    async (view: ListView) => {
      const { error } = await supabase.from("list_views").delete().eq("id", view.id);
      if (error) return toast.error(error.message);
      toast.success("View deleted");
      selectView(null);
      await load();
    },
    [load, selectView]
  );


  const pinDefault = useCallback(
    async (view: ListView | null) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      await supabase.from("list_views").update({ is_default: false }).eq("section", section).eq("user_id", uid);
      if (view && !view.is_standard && view.owner_id === uid) {
        const { error } = await supabase.from("list_views").update({ is_default: true }).eq("id", view.id);
        if (error) return toast.error(error.message);
        toast.success(`"${view.name}" pinned as default`);
      } else if (view && !view.is_standard) {
        toast.error("You can only pin views you own");
      } else {
        toast.success(`"${view?.name ?? "All Leads"}" pinned as default`);
      }
      await load();
    },
    [section, load]
  );

  return {
    views,
    allViews,
    standardViews,
    updateStandardColumns,
    updateStandardFilters,
    updateStandardCharts,


    loading,
    userId,
    activeView,
    activeViewId,
    selectView,
    saveView,
    saveCharts,
    deleteView,

    pinDefault,
    reload: load,
  };
}
