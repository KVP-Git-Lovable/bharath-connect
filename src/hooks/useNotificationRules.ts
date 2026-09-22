import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type NotificationRule = Database["public"]["Tables"]["notification_rules"]["Row"];
export type NotificationRuleInput = Database["public"]["Tables"]["notification_rules"]["Insert"];
export type NotificationEventType = Database["public"]["Tables"]["notification_event_types"]["Row"];

export const RECEIVER_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "employee", label: "The employee / owner", hint: "The person the record belongs to: the employee, lead owner or task assignee" },
  { value: "manager", label: "Their manager", hint: "Direct reporting manager of that person" },
  { value: "hierarchy", label: "Manager chain", hint: "Manager, their manager, and so on up" },
  { value: "admin", label: "All admins", hint: "Every active admin user" },
  { value: "role", label: "Security profile", hint: "Everyone with a chosen security profile" },
  { value: "specific_user", label: "A specific person", hint: "One named user" },
  { value: "project_members", label: "Project members", hint: "Everyone on the record's project" },
  { value: "site_team", label: "Site team", hint: "Everyone assigned to the record's site" },
];

/** Recipient types that depend on the record (shown only when the event supports them). */
export const CONTEXT_RECEIVERS = ["project_members", "site_team"];
/** Person-based recipients; hidden for events that have no person (e.g. site milestones). */
export const PERSON_RECEIVERS = ["employee", "manager", "hierarchy"];
export const PERSONLESS_MODULES = ["site_milestones"];

export function receiverOptions(sourceTable: string, extra: string[] | null | undefined) {
  return RECEIVER_TYPES.filter((r) => {
    if (CONTEXT_RECEIVERS.includes(r.value)) return (extra || []).includes(r.value);
    if (PERSON_RECEIVERS.includes(r.value)) return !PERSONLESS_MODULES.includes(sourceTable);
    return true;
  });
}

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
    p_receiver_role: (args.receiver_role ?? undefined)!,
    p_receiver_user_id: (args.receiver_user_id ?? undefined)!,
    p_sample_actor: (args.sample_actor ?? undefined)!,
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
  return template.replace(/\{([a-z0-9_]+)\}/gi, (m, key: string) => (key in sample ? sample[key]! : m));
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
  lead_name: "Metro rail tender",
  company: "BMRCL",
  lead_status: "Qualified",
  old_status: "New",
  assigned_by: "Meena Rao",
  value: "₹5,00,000.00",
  opportunity_name: "BMRCL Phase 2",
  customer: "ABC Cables Pvt Ltd",
  stage: "Negotiation",
  old_stage: "Proposal",
  probability: "60",
  close_date: "30-Sep-2026",
  task_title: "Pull cable drum report",
  project_name: "Metro Cabling",
  due_date: "15-Sep-2026",
  priority: "High",
  commenter_name: "Arjun S",
  comment: "Report uploaded, please review.",
  file_name: "drum-report.pdf",
  milestone_name: "Cabling – Phase 1",
  site_name: "Peenya Plant",
  end_date: "12-Sep-2026",
  percent_complete: "70",
  po_number: "PO-0042",
  vendor: "Polycab Distributors",
  grn_number: "GRN-7",
  receipt_date: "11-Sep-2026",
  invoice_number: "INV-991",
  invoice_date: "11-Sep-2026",
  payment_date: "11-Sep-2026",
  reference: "UTR123456",
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
  lead_name: "Lead",
  company: "Company",
  lead_status: "Lead status",
  old_status: "Previous status",
  assigned_by: "Assigned by",
  value: "Value",
  opportunity_name: "Opportunity",
  customer: "Customer",
  stage: "Stage",
  old_stage: "Previous stage",
  probability: "Probability %",
  close_date: "Close date",
  task_title: "Task",
  project_name: "Project",
  due_date: "Due date",
  priority: "Priority",
  commenter_name: "By",
  comment: "Comment",
  file_name: "File",
  milestone_name: "Milestone",
  site_name: "Site",
  end_date: "End date",
  percent_complete: "% complete",
  po_number: "PO number",
  vendor: "Vendor",
  grn_number: "GRN number",
  receipt_date: "Receipt date",
  invoice_number: "Invoice number",
  invoice_date: "Invoice date",
  payment_date: "Payment date",
  reference: "Reference",
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
  "leads:RECORD_CREATED": {
    title: "New lead: {lead_name}",
    message: "{user_name} added the lead {lead_name} ({company}), value {value}.",
  },
  "leads:LEAD_ASSIGNED": {
    title: "New lead assigned: {lead_name}",
    message: "{assigned_by} assigned you the lead {lead_name} ({company}).",
  },
  "leads:LEAD_STATUS_CHANGED": {
    title: "{lead_name}: {lead_status}",
    message: "{user_name}'s lead {lead_name} moved from {old_status} to {lead_status}.",
  },
  "leads:LEAD_CONVERTED": {
    title: "Lead converted: {lead_name}",
    message: "{user_name} converted {lead_name} ({company}) to a customer.",
  },
  "customer_opportunities:RECORD_CREATED": {
    title: "New opportunity: {opportunity_name}",
    message: "{user_name} created {opportunity_name} with {customer} worth {amount}, closing {close_date}.",
  },
  "customer_opportunities:OPPORTUNITY_STAGE_CHANGED": {
    title: "{opportunity_name}: {stage}",
    message: "{opportunity_name} ({customer}, {amount}) moved from {old_stage} to {stage}.",
  },
  "customer_opportunities:OPPORTUNITY_WON": {
    title: "Opportunity won: {opportunity_name}",
    message: "{user_name} won {opportunity_name} with {customer} worth {amount}.",
  },
  "customer_opportunities:OPPORTUNITY_LOST": {
    title: "Opportunity lost: {opportunity_name}",
    message: "{opportunity_name} with {customer} ({amount}) was marked {stage}.",
  },
  "pm_tasks:TASK_ASSIGNED": {
    title: "New task: {task_title}",
    message: "{assigned_by} assigned you \"{task_title}\" in {project_name}. Due {due_date}.",
  },
  "pm_tasks:TASK_STATUS_CHANGED": {
    title: "{task_title}: {status}",
    message: "\"{task_title}\" in {project_name} is now {status}.",
  },
  "pm_tasks:TASK_COMPLETED": {
    title: "Task done: {task_title}",
    message: "{user_name} completed \"{task_title}\" in {project_name}.",
  },
  "pm_tasks:TASK_BLOCKED": {
    title: "Task blocked: {task_title}",
    message: "\"{task_title}\" in {project_name} is blocked. Reason: {reason}",
  },
  "pm_tasks:TASK_OVERDUE": {
    title: "Task overdue: {task_title}",
    message: "\"{task_title}\" in {project_name} was due {due_date} and is still {status}.",
  },
  "pm_tasks:COMMENT_ADDED": {
    title: "New comment on {task_title}",
    message: "{commenter_name}: {comment}",
  },
  "pm_tasks:FILE_UPLOADED": {
    title: "New file on {task_title}",
    message: "{commenter_name} attached {file_name} to \"{task_title}\".",
  },
  "site_milestones:MILESTONE_AT_RISK": {
    title: "Milestone at risk: {milestone_name}",
    message: "{milestone_name} at {site_name} is at risk ({percent_complete}% done, due {end_date}).",
  },
  "site_milestones:MILESTONE_COMPLETED": {
    title: "Milestone completed: {milestone_name}",
    message: "{milestone_name} at {site_name} is complete.",
  },
  "site_milestones:MILESTONE_OVERDUE": {
    title: "Milestone overdue: {milestone_name}",
    message: "{milestone_name} at {site_name} was due {end_date} and is {percent_complete}% complete.",
  },
  "procurement_orders:RECORD_CREATED": {
    title: "New PO: {po_number}",
    message: "{user_name} raised {po_number} with {vendor} for {site_name} ({amount}).",
  },
  "procurement_orders:PO_STATUS_CHANGED": {
    title: "{po_number}: {status}",
    message: "{po_number} ({vendor}) moved from {old_status} to {status}.",
  },
  "procurement_orders:GRN_RECEIVED": {
    title: "Goods received: {po_number}",
    message: "Goods from {vendor} were received for {po_number} at {site_name} on {receipt_date} ({grn_number}).",
  },
  "procurement_orders:INVOICE_ADDED": {
    title: "Invoice added: {invoice_number}",
    message: "Invoice {invoice_number} for {amount} from {vendor} was added to {po_number}.",
  },
  "procurement_orders:PAYMENT_RECORDED": {
    title: "Payment recorded: {amount}",
    message: "{amount} paid against {invoice_number} ({po_number}, {vendor}) on {payment_date}. Ref: {reference}",
  },
};
