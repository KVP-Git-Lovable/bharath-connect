import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type NotificationRule = Database["public"]["Tables"]["notification_rules"]["Row"];
export type NotificationRuleInput = Database["public"]["Tables"]["notification_rules"]["Insert"];
export type NotificationEventType = Database["public"]["Tables"]["notification_event_types"]["Row"];

export const RECEIVER_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "employee", label: "The employee", hint: "The person the record belongs to" },
  { value: "manager", label: "Their manager", hint: "Direct reporting manager" },
  { value: "hierarchy", label: "Manager chain", hint: "Manager, their manager, and so on up" },
  { value: "admin", label: "All admins", hint: "Every active admin user" },
  { value: "role", label: "Security profile", hint: "Everyone with a chosen security profile" },
  { value: "specific_user", label: "A specific person", hint: "One named user" },
];

export const receiverLabel = (rule: Pick<NotificationRule, "receiver_type" | "receiver_role">, userName?: string) => {
  const base = RECEIVER_TYPES.find((r) => r.value === rule.receiver_type)?.label ?? rule.receiver_type;
  if (rule.receiver_type === "role" && rule.receiver_role) return `Profile: ${rule.receiver_role}`;
  if (rule.receiver_type === "specific_user") return userName ? userName : base;
  return base;
};

const RULES_KEY = ["notification-rules"];

export function useNotificationRules() {
  return useQuery({
    queryKey: RULES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as NotificationRule[];
    },
  });
}

export function useNotificationEventTypes() {
  return useQuery({
    queryKey: ["notification-event-types"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_event_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as NotificationEventType[];
    },
  });
}

export function useNotificationRuleStats() {
  return useQuery({
    queryKey: ["notification-rule-stats"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("notification_event_log")
        .select("created_at, notifications_created")
        .gte("created_at", since)
        .limit(5000);
      if (error) throw error;
      const rows = data || [];
      return {
        eventsToday: rows.filter((r) => new Date(r.created_at) >= startOfDay).length,
        sent7d: rows.reduce((sum, r) => sum + (r.notifications_created || 0), 0),
      };
    },
  });
}

export function usePeopleOptions() {
  return useQuery({
    queryKey: ["notification-people-options"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [{ data: users, error: uErr }, { data: profiles, error: pErr }] = await Promise.all([
        supabase.from("users").select("id, full_name, email, is_active").eq("is_active", true).order("full_name"),
        supabase.from("security_profiles").select("id, name").order("name"),
      ]);
      if (uErr) throw uErr;
      if (pErr) throw pErr;
      return {
        users: (users || []).map((u) => ({ id: u.id, name: u.full_name || u.email })),
        profiles: (profiles || []).map((p) => p.name),
      };
    },
  });
}

function useInvalidateRules() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: RULES_KEY });
    qc.invalidateQueries({ queryKey: ["notification-rule-stats"] });
  };
}

export function useSaveNotificationRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: NotificationRuleInput }) => {
      if (id) {
        const { error } = await supabase.from("notification_rules").update(values).eq("id", id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("notification_rules")
          .insert({ ...values, created_by: auth.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useToggleNotificationRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("notification_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteNotificationRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notification_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export async function previewRecipients(args: {
  receiver_type: string;
  receiver_role?: string | null;
  receiver_user_id?: string | null;
  sample_actor?: string | null;
  include_secondary?: boolean;
}) {
  const { data, error } = await supabase.rpc("notif_preview_recipients", {
    p_receiver_type: args.receiver_type,
    p_receiver_role: args.receiver_role ?? undefined,
    p_receiver_user_id: args.receiver_user_id ?? undefined,
    p_sample_actor: args.sample_actor ?? undefined,
    p_include_secondary: args.include_secondary ?? false,
  });
  if (error) throw error;
  return data || [];
}

export async function sendTestNotification(ruleId: string) {
  const { data, error } = await supabase.rpc("notify_send_test", { p_rule_id: ruleId });
  if (error) throw error;
  return data as { notification_id: string; push: boolean } | null;
}

/** Fill a template with sample values, mirroring the database notif_fill(). */
export function fillSample(template: string, sample: Record<string, string>) {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (m, key: string) => (key in sample ? sample[key] : m));
}

export const SAMPLE_VALUES: Record<string, string> = {
  user_name: "Ravi Kumar",
  module_name: "Leave",
  record_name: "Sample record",
  status: "approved",
  approver_name: "Meena Rao",
  leave_type: "Casual Leave",
  from_date: "15-Sep-2026",
  to_date: "16-Sep-2026",
  days: "2",
  reason: "Family function",
  request_type: "Missed check-out",
  request_date: "10-Sep-2026",
  rejection_reason: "Bill missing",
  amount: "₹1,250.00",
  category: "Travel",
  expense_date: "10-Sep-2026",
  activity_name: "Site visit – ABC Cables",
  activity_type: "Site Visit",
  activity_date: "11-Sep-2026",
  outcome: "Quote requested",
  location: "Peenya, Bengaluru",
  travel_distance_km: "12.4",
  travel_time_mins: "35",
  attendance_date: "11-Sep-2026",
  check_in_time: "09:05 AM",
  check_out_time: "06:40 PM",
  total_hours: "9.6",
  date: "11-Sep-2026",
  time: "09:05 AM",
  datetime: "11-Sep-2026 09:05 AM",
  weekday: "Friday",
};

export const TOKEN_LABELS: Record<string, string> = {
  user_name: "Employee name",
  approver_name: "Approver",
  leave_type: "Leave type",
  from_date: "From",
  to_date: "To",
  days: "Days",
  reason: "Reason",
  request_type: "Request type",
  request_date: "Date",
  rejection_reason: "Rejection reason",
  amount: "Amount",
  category: "Category",
  expense_date: "Expense date",
  activity_name: "Activity",
  activity_type: "Activity type",
  activity_date: "Activity date",
  outcome: "Outcome",
  location: "Location",
  travel_distance_km: "Distance (km)",
  travel_time_mins: "Travel time (min)",
  attendance_date: "Date",
  check_in_time: "Check-in time",
  check_out_time: "Check-out time",
  total_hours: "Hours",
  status: "Status",
  date: "Today",
  time: "Now",
};

/** Ready-made wording per event, used by "Use suggested text" in the editor. */
export const SUGGESTED_TEXT: Record<string, { title: string; message: string }> = {
  "attendance:CHECK_IN": {
    title: "{user_name} started the day",
    message: "{user_name} checked in at {check_in_time} on {attendance_date}.",
  },
  "attendance:CHECK_OUT": {
    title: "{user_name} ended the day",
    message: "{user_name} checked out at {check_out_time} on {attendance_date} after {total_hours} hours.",
  },
  "leave_applications:RECORD_CREATED": {
    title: "Leave applied: {user_name}",
    message: "{user_name} applied for {leave_type} from {from_date} to {to_date} ({days} day/s). Reason: {reason}",
  },
  "leave_applications:RECORD_APPROVED": {
    title: "Leave approved",
    message: "Your {leave_type} from {from_date} to {to_date} was approved by {approver_name}.",
  },
  "leave_applications:RECORD_REJECTED": {
    title: "Leave rejected",
    message: "Your {leave_type} from {from_date} to {to_date} was rejected by {approver_name}.",
  },
  "leave_applications:RECORD_CANCELLED": {
    title: "Leave cancelled: {user_name}",
    message: "{user_name} cancelled {leave_type} from {from_date} to {to_date}.",
  },
  "regularization_requests:RECORD_CREATED": {
    title: "Regularization requested: {user_name}",
    message: "{user_name} requested {request_type} for {request_date}. Reason: {reason}",
  },
  "regularization_requests:RECORD_APPROVED": {
    title: "Regularization approved",
    message: "Your {request_type} request for {request_date} was approved by {approver_name}.",
  },
  "regularization_requests:RECORD_REJECTED": {
    title: "Regularization rejected",
    message: "Your {request_type} request for {request_date} was rejected. Reason: {rejection_reason}",
  },
  "additional_expenses:RECORD_CREATED": {
    title: "Expense submitted: {amount}",
    message: "{user_name} submitted a {category} expense of {amount} for {expense_date}.",
  },
  "additional_expenses:RECORD_APPROVED": {
    title: "Expense approved: {amount}",
    message: "Your {category} expense of {amount} for {expense_date} was approved by {approver_name}.",
  },
  "additional_expenses:RECORD_REJECTED": {
    title: "Expense rejected: {amount}",
    message: "Your {category} expense of {amount} for {expense_date} was rejected. Reason: {rejection_reason}",
  },
  "activity_events:RECORD_CREATED": {
    title: "New activity: {activity_name}",
    message: "{user_name} planned \"{activity_name}\" ({activity_type}) on {activity_date}.",
  },
  "activity_events:ACTIVITY_CHECKED_IN": {
    title: "{user_name} checked in: {activity_name}",
    message: "{user_name} checked in to \"{activity_name}\" at {location}. Travelled {travel_distance_km} km in {travel_time_mins} min.",
  },
  "activity_events:ACTIVITY_COMPLETED": {
    title: "Activity completed: {activity_name}",
    message: "{user_name} completed \"{activity_name}\" ({activity_type}) on {activity_date}.",
  },
};
