import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BudgetStatus = "confirmed" | "estimated" | "unknown";
export type AuthorityRole = "decision_maker" | "influencer" | "end_user" | "unknown";
export type NeedLevel = "critical" | "moderate" | "low" | "unclear";
export type TimelineTier = "immediate" | "this_quarter" | "next_quarter" | "unclear";

export const BUDGET_LABELS: Record<BudgetStatus, string> = {
  confirmed: "Confirmed", estimated: "Estimated", unknown: "Unknown",
};
export const AUTHORITY_LABELS: Record<AuthorityRole, string> = {
  decision_maker: "Decision Maker", influencer: "Influencer", end_user: "End User", unknown: "Unknown",
};
export const NEED_LABELS: Record<NeedLevel, string> = {
  critical: "Critical", moderate: "Moderate", low: "Low", unclear: "Unclear",
};
export const TIMELINE_LABELS: Record<TimelineTier, string> = {
  immediate: "Immediate", this_quarter: "This Quarter", next_quarter: "Next Quarter", unclear: "Unclear",
};

export interface OppScoringRules {
  budget: Record<BudgetStatus, number>;
  authority: Record<AuthorityRole, number>;
  need: Record<NeedLevel, number>;
  timeline: Record<TimelineTier, number>;
  qualification: { high: number; medium: number };
  // Health thresholds
  health: {
    daysInStageWarn: number;    // amber
    daysInStageBad: number;     // red
    daysSinceActivityWarn: number;
    daysSinceActivityBad: number;
    closeSoonDays: number;      // e.g. 7
  };
}

export const DEFAULT_OPP_SCORING: OppScoringRules = {
  budget: { confirmed: 10, estimated: 5, unknown: 0 },
  authority: { decision_maker: 10, influencer: 5, end_user: 2, unknown: 0 },
  need: { critical: 10, moderate: 6, low: 3, unclear: 0 },
  timeline: { immediate: 10, this_quarter: 6, next_quarter: 3, unclear: 0 },
  qualification: { high: 30, medium: 15 },
  health: {
    daysInStageWarn: 14, daysInStageBad: 30,
    daysSinceActivityWarn: 7, daysSinceActivityBad: 14,
    closeSoonDays: 7,
  },
};

const MODULE = "opportunity_scoring";
const KEY = "rules";

export function useOpportunityScoringRules() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["opp-scoring-rules"],
    queryFn: async (): Promise<OppScoringRules> => {
      const { data, error } = await supabase
        .from("app_configuration" as any)
        .select("config_value")
        .eq("module", MODULE)
        .eq("config_key", KEY)
        .maybeSingle();
      if (error) throw error;
      const cv = (data as any)?.config_value ?? {};
      return {
        ...DEFAULT_OPP_SCORING,
        ...cv,
        health: { ...DEFAULT_OPP_SCORING.health, ...(cv.health ?? {}) },
        qualification: { ...DEFAULT_OPP_SCORING.qualification, ...(cv.qualification ?? {}) },
      } as OppScoringRules;
    },
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (rules: OppScoringRules) => {
      const { error } = await supabase.from("app_configuration" as any).upsert(
        { module: MODULE, config_key: KEY, config_value: rules as any, updated_at: new Date().toISOString() },
        { onConflict: "module,config_key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opp-scoring-rules"] });
      toast.success("Opportunity scoring rules saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { rules: data ?? DEFAULT_OPP_SCORING, isLoading, save: save.mutate, saving: save.isPending };
}

export function qualificationLevel(total: number, rules: OppScoringRules): "High" | "Medium" | "Low" {
  if (total >= rules.qualification.high) return "High";
  if (total >= rules.qualification.medium) return "Medium";
  return "Low";
}
