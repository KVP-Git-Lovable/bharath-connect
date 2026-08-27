import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ContactRole =
  | "decision_maker"
  | "decision_support"
  | "procurement"
  | "technical_evaluator"
  | "financial_evaluator"
  | "gate_keeper"
  | "user"
  | "unknown";

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  decision_maker: "Decision Maker",
  decision_support: "Decision Support",
  procurement: "Procurement",
  technical_evaluator: "Technical Evaluator",
  financial_evaluator: "Financial Evaluator",
  gate_keeper: "Gate Keeper",
  user: "User",
  unknown: "Unknown",
};

export interface ScoringRules {
  statusScores: Record<string, number>; // keyed by status name (lowercased)
  contactRoleScores: Record<ContactRole, number>;
  activityThresholds: { min: number; score: number }[]; // sorted desc by min
  ageBuckets: { maxDays: number; score: number }[]; // sorted asc by maxDays
  budget: {
    shared: number;          // budget entered
    aligned: number;         // budget close to opportunity value
    none: number;            // no budget shared
    tolerancePct: number;    // % variance allowed to count as "aligned"
  };
  closeDate: {
    thisMonth: number;
    nextMonth: number;
    later: number;
    none: number;
  };
  need: {
    clear: number;
    vague: number;
    none: number;
    clearMinChars: number;
  };
  qualification: { high: number; medium: number };
}

export const DEFAULT_SCORING_RULES: ScoringRules = {
  statusScores: {
    new: 0,
    contacted: 5,
    qualified: 10,
    "proposal sent": 12,
    negotiation: 15,
    converted: 20,
    lost: 0,
  },
  contactRoleScores: {
    decision_maker: 10,
    decision_support: 7,
    procurement: 6,
    technical_evaluator: 6,
    financial_evaluator: 6,
    gate_keeper: 3,
    user: 2,
    unknown: 0,
  },
  activityThresholds: [
    { min: 3, score: 10 },
    { min: 1, score: 5 },
    { min: 0, score: 0 },
  ],
  ageBuckets: [
    { maxDays: 7, score: 10 },
    { maxDays: 30, score: 5 },
    { maxDays: 999999, score: 2 },
  ],
  budget: { shared: 5, aligned: 10, none: 0, tolerancePct: 10 },
  closeDate: { thisMonth: 10, nextMonth: 6, later: 3, none: 0 },
  need: { clear: 10, vague: 4, none: 0, clearMinChars: 80 },
  qualification: { high: 30, medium: 15 },
};


const MODULE = "lead_scoring";
const KEY = "rules";

export function useLeadScoringRules() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["lead-scoring-rules"],
    queryFn: async (): Promise<ScoringRules> => {
      const { data, error } = await supabase
        .from("app_configuration" as any)
        .select("config_value")
        .eq("module", MODULE)
        .eq("config_key", KEY)
        .maybeSingle();
      if (error) throw error;
      const cv = ((data as any)?.config_value ?? {}) as Partial<ScoringRules>;
      return {
        ...DEFAULT_SCORING_RULES,
        ...cv,
        budget: { ...DEFAULT_SCORING_RULES.budget, ...(cv.budget ?? {}) },
        closeDate: { ...DEFAULT_SCORING_RULES.closeDate, ...(cv.closeDate ?? {}) },
        need: { ...DEFAULT_SCORING_RULES.need, ...(cv.need ?? {}) },
        qualification: { ...DEFAULT_SCORING_RULES.qualification, ...(cv.qualification ?? {}) },
      } as ScoringRules;
    },
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (rules: ScoringRules) => {
      const { error } = await supabase.from("app_configuration" as any).upsert(
        { module: MODULE, config_key: KEY, config_value: rules as any, updated_at: new Date().toISOString() },
        { onConflict: "module,config_key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-scoring-rules"] });
      toast.success("Scoring rules saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { rules: data ?? DEFAULT_SCORING_RULES, isLoading, save: save.mutate, saving: save.isPending };
}

export function activityScore(count: number, rules: ScoringRules): number {
  const sorted = [...rules.activityThresholds].sort((a, b) => b.min - a.min);
  for (const t of sorted) if (count >= t.min) return t.score;
  return 0;
}

export function ageScore(days: number, rules: ScoringRules): number {
  const sorted = [...rules.ageBuckets].sort((a, b) => a.maxDays - b.maxDays);
  for (const b of sorted) if (days <= b.maxDays) return b.score;
  return 0;
}

export function statusScore(statusName: string | undefined | null, rules: ScoringRules): number {
  if (!statusName) return 0;
  return rules.statusScores[statusName.toLowerCase()] ?? 0;
}

export type BudgetTier = "aligned" | "shared" | "none";

export function budgetTier(
  budget: number | null | undefined,
  opportunityValue: number | null | undefined,
  rules: ScoringRules,
): BudgetTier {
  if (budget == null || Number(budget) <= 0) return "none";
  const opp = Number(opportunityValue ?? 0);
  if (opp > 0) {
    const variance = (Math.abs(Number(budget) - opp) / opp) * 100;
    if (variance <= rules.budget.tolerancePct) return "aligned";
  }
  return "shared";
}

export function budgetScore(
  budget: number | null | undefined,
  opportunityValue: number | null | undefined,
  rules: ScoringRules,
): number {
  const tier = budgetTier(budget, opportunityValue, rules);
  return rules.budget[tier];
}

export type CloseDateTier = "thisMonth" | "nextMonth" | "later" | "none";

export function closeDateTier(closeDate: string | null | undefined): CloseDateTier {
  if (!closeDate) return "none";
  const d = new Date(closeDate);
  if (isNaN(d.getTime())) return "none";
  const now = new Date();
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  if (months <= 0) return "thisMonth";
  if (months === 1) return "nextMonth";
  return "later";
}

export function closeDateScore(closeDate: string | null | undefined, rules: ScoringRules): number {
  return rules.closeDate[closeDateTier(closeDate)];
}

export type NeedTier = "clear" | "vague" | "none";

export function needTier(requirement: string | null | undefined, rules: ScoringRules): NeedTier {
  const text = (requirement ?? "").trim();
  if (!text) return "none";
  return text.length >= rules.need.clearMinChars ? "clear" : "vague";
}

export function needScore(requirement: string | null | undefined, rules: ScoringRules): number {
  return rules.need[needTier(requirement, rules)];
}


export function qualificationLevel(total: number, rules: ScoringRules): "High" | "Medium" | "Low" {
  if (total >= rules.qualification.high) return "High";
  if (total >= rules.qualification.medium) return "Medium";
  return "Low";
}

export function useLeadActivityCount(leadId?: string) {
  return useQuery({
    queryKey: ["lead-activity-count", leadId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("activity_events" as any)
        .select("*", { count: "exact", head: true })
        .eq("lead_id", leadId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!leadId,
  });
}

export function useLeadFirstActivityDate(leadId?: string) {
  return useQuery({
    queryKey: ["lead-first-activity", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_activities" as any)
        .select("activity_date, created_at")
        .eq("lead_id", leadId!)
        .order("activity_date", { ascending: true })
        .limit(1);
      if (error) throw error;
      const row = (data ?? [])[0] as any;
      return row?.activity_date || row?.created_at || null;
    },
    enabled: !!leadId,
  });
}
