/** Where tapping a notification should take the user (null = stay put). */
export function notificationRoute(n: {
  type?: string | null;
  related_id?: string | null;
  metadata?: unknown;
}): string | null {
  if (n.type === "leave_request" || n.type === "regularization_request") {
    const params = new URLSearchParams();
    if (n.related_id) params.set("id", n.related_id);
    params.set("type", n.type);
    return `/pending-approvals?${params.toString()}`;
  }
  if (n.type === "leave_decision" || n.type === "regularization_decision") return "/attendance";
  const route = (n.metadata as { route?: unknown } | null | undefined)?.route;
  return typeof route === "string" && route.startsWith("/") ? route : null;
}

export const MODULE_LABELS: Record<string, string> = {
  attendance: "Attendance",
  leave_applications: "Leave",
  regularization_requests: "Regularization",
  additional_expenses: "Expenses",
  activity_events: "Activities",
  leads: "Leads",
  customer_opportunities: "Opportunities",
  pm_tasks: "Tasks",
  site_milestones: "Milestones",
  procurement_orders: "Procurement",
};

export const moduleLabel = (table: string | null | undefined) =>
  table ? MODULE_LABELS[table] ?? table.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Other";
