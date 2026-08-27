import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import {
  ContactRole, ScoringRules, activityScore, ageScore, statusScore, qualificationLevel,
  budgetScore, needScore, closeDateScore,
} from "@/hooks/useLeadScoring";

export type SlaLabel = "Not Started" | "SLA Met" | "On Track" | "SLA Breached";

export const SLA_BADGE_CLASSES: Record<SlaLabel, string> = {
  "Not Started": "bg-muted text-muted-foreground",
  "SLA Met": "bg-emerald-100 text-emerald-700",
  "On Track": "bg-blue-100 text-blue-700",
  "SLA Breached": "bg-rose-100 text-rose-700",
};

export const BANT_LEVEL_CLASSES: Record<string, string> = {
  High: "bg-emerald-100 text-emerald-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-rose-100 text-rose-700",
};

const SLA_STAGES = [
  { key: "contacted", match: "contacted", offset: 0 },
  { key: "interest", match: "shown interest", offset: 5 },
  { key: "quote", match: "quote submitted", offset: 10 },
  { key: "won", match: "close won", offset: 25 },
] as const;

const PRODUCTIVE_STAGES = [
  "contacted", "shown interest", "quote submitted", "negotiation", "close won",
];

/** Derives the overall SLA status from a lead's audit trail (status transitions). */
export function slaStatusFromAudit(
  auditRows: { to_value?: string | null; created_at: string }[],
  fallbackContactDate?: string | null,
): SlaLabel {
  const rows = [...auditRows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const actuals: Record<string, string | null> = {};
  for (const s of SLA_STAGES) {
    const hit = rows.find((r) => String(r.to_value || "").trim().toLowerCase() === s.match);
    actuals[s.key] = hit ? String(hit.created_at).slice(0, 10) : null;
  }
  // Contact date = first move into ANY productive stage (contacted may be skipped)
  const firstProductive = rows.find((r) =>
    PRODUCTIVE_STAGES.includes(String(r.to_value || "").trim().toLowerCase()),
  );
  if (firstProductive) {
    const d = String(firstProductive.created_at).slice(0, 10);
    if (!actuals.contacted || d < actuals.contacted) actuals.contacted = d;
  }
  if (!actuals.contacted && fallbackContactDate) {
    actuals.contacted = String(fallbackContactDate).slice(0, 10);
  }
  const contactDate = actuals.contacted;
  if (!contactDate) return "Not Started";

  const flags = SLA_STAGES.filter((s) => s.key !== "contacted").map((s) => {
    const target = addDays(parseISO(contactDate), s.offset);
    const actual = actuals[s.key];
    if (actual) return differenceInCalendarDays(parseISO(actual), target) <= 0 ? "met" : "breached";
    return differenceInCalendarDays(new Date(), target) > 0 ? "overdue" : "pending";
  });

  if (flags.some((f) => f === "breached" || f === "overdue")) return "SLA Breached";
  if (flags.every((f) => f === "met")) return "SLA Met";
  return "On Track";
}

export function bantScore(
  args: {
    statusName?: string | null;
    contactRole?: string | null;
    activityCount: number;
    createdAt: string;
    indicativeBudget?: number | null;
    opportunityValue?: number | null;
    requirement?: string | null;
    closeDate?: string | null;
  },
  rules: ScoringRules,
) {
  const role = (args.contactRole || "unknown") as ContactRole;
  const ageDays = differenceInCalendarDays(new Date(), new Date(args.createdAt));
  const total =
    budgetScore(args.indicativeBudget, args.opportunityValue, rules) +
    (rules.contactRoleScores[role] ?? 0) +
    needScore(args.requirement, rules) +
    closeDateScore(args.closeDate, rules) +
    statusScore(args.statusName, rules) +
    activityScore(args.activityCount, rules) +
    ageScore(ageDays, rules);
  return { total, level: qualificationLevel(total, rules) };
}

export interface LeadInsight {
  activityCount: number;
  documentCount: number;
  sla: SlaLabel;
}

/** Bulk fetch of activity counts, document counts and audit trails for a set of leads. */
export function useLeadsInsights(leadIds: string[]) {
  const key = [...leadIds].sort().join(",");
  return useQuery({
    queryKey: ["leads-insights", key],
    enabled: leadIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, LeadInsight>> => {
      const [acts, docs, audit] = await Promise.all([
        supabase.from("activity_events" as any).select("lead_id").in("lead_id", leadIds),
        supabase.from("customer_documents" as any).select("lead_id").in("lead_id", leadIds),
        supabase.from("lead_audit_log" as any).select("lead_id, to_value, created_at").in("lead_id", leadIds),
      ]);

      const map: Record<string, LeadInsight> = {};
      for (const id of leadIds) map[id] = { activityCount: 0, documentCount: 0, sla: "Not Started" };

      ((acts.data ?? []) as any[]).forEach((r) => { if (map[r.lead_id]) map[r.lead_id].activityCount += 1; });
      ((docs.data ?? []) as any[]).forEach((r) => { if (map[r.lead_id]) map[r.lead_id].documentCount += 1; });

      const byLead: Record<string, any[]> = {};
      ((audit.data ?? []) as any[]).forEach((r) => {
        (byLead[r.lead_id] ||= []).push(r);
      });
      for (const id of leadIds) map[id].sla = slaStatusFromAudit(byLead[id] ?? []);

      return map;
    },
  });
}

/** Single-lead variant used on the lead detail highlight panel. */
export function useLeadInsight(leadId?: string) {
  const { data } = useLeadsInsights(leadId ? [leadId] : []);
  return leadId ? data?.[leadId] : undefined;
}
