import { differenceInCalendarDays, parseISO } from "date-fns";

export interface LeadActivityRollup {
  activityCount: number;
  productiveCount: number;
  lastActivityDate: string | null;
  daysSinceLastActivity: number | null;
  nextActivityDate: string | null;
}

export const EMPTY_ROLLUP: LeadActivityRollup = {
  activityCount: 0,
  productiveCount: 0,
  lastActivityDate: null,
  daysSinceLastActivity: null,
  nextActivityDate: null,
};

export interface RollupActivityInput {
  lead_id?: string | null;
  status?: string | null;
  outcome?: string | null;
  activity_date?: string | null;
}

const isProductive = (outcome?: string | null) =>
  String(outcome || "").trim().toLowerCase() === "productive";

/** Builds per-lead activity & effort roll-ups from a flat activity list. */
export function buildLeadRollups(
  activities: RollupActivityInput[],
  today = new Date(),
): Record<string, LeadActivityRollup> {
  const todayStr = today.toISOString().slice(0, 10);
  const byLead: Record<string, RollupActivityInput[]> = {};
  for (const a of activities) {
    if (!a.lead_id) continue;
    (byLead[a.lead_id] ||= []).push(a);
  }

  const out: Record<string, LeadActivityRollup> = {};
  for (const [leadId, list] of Object.entries(byLead)) {
    const dates = list
      .map((a) => String(a.activity_date || "").slice(0, 10))
      .filter(Boolean)
      .sort();
    const past = dates.filter((d) => d <= todayStr);
    const lastActivityDate = past.length ? past[past.length - 1] : null;
    const nextActivityDate = dates.find((d) => d > todayStr) ?? null;
    out[leadId] = {
      activityCount: list.length,
      productiveCount: list.filter(
        (a) => String(a.status || "").toLowerCase() === "completed" && isProductive(a.outcome),
      ).length,
      lastActivityDate,
      daysSinceLastActivity: lastActivityDate
        ? differenceInCalendarDays(today, parseISO(lastActivityDate))
        : null,
      nextActivityDate,
    };
  }
  return out;
}
