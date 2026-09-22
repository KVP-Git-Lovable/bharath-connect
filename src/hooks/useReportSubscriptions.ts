import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ReportSubscription = Database["public"]["Tables"]["report_subscriptions"]["Row"];
export type ReportSubscriptionInput = Database["public"]["Tables"]["report_subscriptions"]["Insert"];
export type DeliveryLog = Database["public"]["Tables"]["report_delivery_log"]["Row"];

export const REPORT_MODULES: { value: string; label: string; savedModule: string | null }[] = [
  { value: "attendance", label: "Attendance", savedModule: "attendance" },
  { value: "activities", label: "Activities", savedModule: "activities" },
  { value: "leave", label: "Leave", savedModule: "leave" },
  { value: "expenses", label: "Expenses", savedModule: null },
  { value: "travel-expense", label: "Travel expense", savedModule: "travel-expense" },
  { value: "leads", label: "Leads", savedModule: "leads" },
  { value: "opportunities", label: "Opportunities", savedModule: "opportunities" },
  { value: "procurement", label: "Procurement", savedModule: null },
];
export const moduleName = (m: string) => REPORT_MODULES.find((x) => x.value === m)?.label ?? m;

export const PERIODS: { value: string; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "current_week", label: "This week so far" },
  { value: "last_week", label: "Last week (Mon–Sun)" },
  { value: "month_to_date", label: "This month so far" },
  { value: "last_month", label: "Last month" },
];
export const periodName = (p: string) => PERIODS.find((x) => x.value === p)?.label ?? p;

export const CADENCES: { value: string; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "mon_sat", label: "Monday to Saturday" },
  { value: "mon_fri", label: "Monday to Friday" },
  { value: "weekly", label: "Once a week" },
  { value: "monthly", label: "Once a month" },
];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const RECIPIENT_MODES: { value: string; label: string; hint: string }[] = [
  { value: "users", label: "Selected people", hint: "Choose people by name" },
  { value: "managers", label: "All managers", hint: "Everyone with a direct report — each sees their own team" },
  { value: "admins", label: "All admins", hint: "Every active admin — sees everyone" },
  { value: "role", label: "Security profile", hint: "Everyone with a chosen security profile" },
];

export function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h! >= 12 ? "PM" : "AM";
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function scheduleText(s: Pick<ReportSubscription, "cadence" | "fire_time" | "fire_weekday" | "fire_monthday">) {
  const time = formatTime(s.fire_time.slice(0, 5));
  switch (s.cadence) {
    case "weekly":
      return `Every ${WEEKDAYS[(s.fire_weekday ?? 1) - 1]} at ${time}`;
    case "monthly":
      return `Monthly on day ${s.fire_monthday ?? 1} at ${time}`;
    case "mon_fri":
      return `Mon–Fri at ${time}`;
    case "mon_sat":
      return `Mon–Sat at ${time}`;
    default:
      return `Daily at ${time}`;
  }
}

const KEY = ["report-subscriptions"];

export function useReportSubscriptions() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_subscriptions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ReportSubscription[];
    },
  });
}

export function useDeliveryStats() {
  return useQuery({
    queryKey: ["report-delivery-stats"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("report_delivery_log")
        .select("recipients, status")
        .gte("created_at", since)
        .limit(5000);
      if (error) throw error;
      return { delivered7d: (data || []).reduce((n, r) => n + (r.status === "sent" ? r.recipients : 0), 0) };
    },
  });
}

export function useDeliveryLog(subscriptionId: string | null) {
  return useQuery({
    queryKey: ["report-delivery-log", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_delivery_log")
        .select("*")
        .eq("subscription_id", subscriptionId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as DeliveryLog[];
    },
  });
}

export function useSavedReports(savedModule: string | null) {
  return useQuery({
    queryKey: ["saved-reports-for-subscription", savedModule],
    enabled: !!savedModule,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_reports")
        .select("id, name, config")
        .eq("module", savedModule!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["report-delivery-stats"] });
    qc.invalidateQueries({ queryKey: ["report-delivery-log"] });
  };
}

export function useSaveSubscription() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ReportSubscriptionInput }) => {
      if (id) {
        const { error } = await supabase.from("report_subscriptions").update(values).eq("id", id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("report_subscriptions")
          .insert({ ...values, created_by: auth.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useSetSubscriptionStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "paused" }) => {
      const { error } = await supabase.from("report_subscriptions").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSubscription() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRunNow() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("report_run_now", { p_sub_id: id });
      if (error) throw error;
      return Number(data || 0);
    },
    onSuccess: invalidate,
  });
}

export type SubscriptionPreview = {
  next_run_at: string | null;
  period_label: string | null;
  recipients: string[];
};

export async function previewSubscription(v: {
  cadence: string;
  fire_time: string;
  fire_weekday: number | null;
  fire_monthday: number | null;
  period: string;
  recipient_mode: string;
  recipient_role: string | null;
  recipient_user_ids: string[];
}) {
  const { data, error } = await supabase.rpc("report_subscription_preview", {
    p_cadence: v.cadence,
    p_fire_time: v.fire_time,
    p_weekday: v.fire_weekday as number,
    p_monthday: v.fire_monthday as number,
    p_period: v.period,
    p_mode: v.recipient_mode,
    p_role: v.recipient_role as string,
    p_user_ids: v.recipient_user_ids,
  });
  if (error) throw error;
  return data as unknown as SubscriptionPreview;
}
