import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type HistoryRow = Database["public"]["Functions"]["notif_history_list"]["Returns"][number];

export type HistoryFilters = {
  range: "today" | "7d" | "30d" | "90d";
  search: string;
  source: string; // all | rules_engine | report | app
  module: string; // all | related_table
  user: string; // all | user id
  read: string; // all | read | unread
  delivery: string; // all | pushed | no_device | push_failed | in_app
};

export const DEFAULT_FILTERS: HistoryFilters = {
  range: "7d",
  search: "",
  source: "all",
  module: "all",
  user: "all",
  read: "all",
  delivery: "all",
};

export function rangeBounds(range: HistoryFilters["range"]) {
  const to = new Date(Date.now() + 60_000);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const days = { today: 0, "7d": 6, "30d": 29, "90d": 89 }[range];
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

const orNull = (v: string) => (v === "all" || v === "" ? undefined : v);

export function useNotificationHistory(filters: HistoryFilters, page: number, pageSize = 25) {
  return useQuery({
    queryKey: ["notification-history", filters, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { from, to } = rangeBounds(filters.range);
      const { data, error } = await supabase.rpc("notif_history_list", {
        p_from: from,
        p_to: to,
        p_search: filters.search.trim() || undefined,
        p_source: orNull(filters.source),
        p_module: orNull(filters.module),
        p_user: orNull(filters.user),
        p_read: orNull(filters.read),
        p_delivery: orNull(filters.delivery)!,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      const rows = (data || []) as HistoryRow[];
      return { rows, total: rows.length ? Number(rows[0]!.total_count) : 0 };
    },
  });
}

export type HistoryStats = {
  total: number;
  read: number;
  pushed: number;
  no_device: number;
  push_failed: number;
  by_source: Record<string, number>;
  modules: string[];
};

export function useNotificationHistoryStats(range: HistoryFilters["range"]) {
  return useQuery({
    queryKey: ["notification-history-stats", range],
    queryFn: async () => {
      const { from, to } = rangeBounds(range);
      const { data, error } = await supabase.rpc("notif_history_stats", { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as HistoryStats;
    },
  });
}

export const SOURCE_LABELS: Record<string, string> = {
  rules_engine: "Rule",
  report: "Report",
  app: "App",
};

export const DELIVERY_INFO: Record<string, { label: string; tone: string; help: string }> = {
  pushed: { label: "Pushed", tone: "bg-emerald-100 text-emerald-700", help: "Shown in the bell and sent to the phone." },
  delivered: { label: "In-app", tone: "bg-slate-100 text-slate-700", help: "Shown in the bell. No phone push was requested." },
  push_skipped: { label: "In-app", tone: "bg-slate-100 text-slate-700", help: "Shown in the bell. Push was off for this rule or the person opted out." },
  no_device: { label: "No device", tone: "bg-amber-100 text-amber-800", help: "Shown in the bell. The person has no phone registered for push — they need to open the app once." },
  push_failed: { label: "Push failed", tone: "bg-red-100 text-red-700", help: "Shown in the bell, but the push service rejected the phone push. See the notification-push logs." },
};
