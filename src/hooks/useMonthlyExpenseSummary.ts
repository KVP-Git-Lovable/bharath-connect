import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DailyBreakdownRow {
  date: string;
  present: number;
  km: number;
  ta: number;
  da: number;
  additional: number;
}
export interface WeeklyBreakdownRow {
  week_start: string;
  ta: number;
  da: number;
  additional: number;
}
export interface MonthlyExpenseSummary {
  ta: number;
  da: number;
  additional_approved: number;
  additional_pending: number;
  total: number;
  present_days: number;
  total_km: number;
  daily: DailyBreakdownRow[];
  weekly: WeeklyBreakdownRow[];
}

export function useMonthlyExpenseSummary(userId: string | undefined, yearMonth: string) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["monthly-expense-summary", userId, yearMonth],
    queryFn: async (): Promise<MonthlyExpenseSummary> => {
      const { data, error } = await supabase.rpc("get_monthly_expense_summary" as any, {
        _user_id: userId,
        _year_month: yearMonth,
      });
      if (error) throw error;
      const d = (data || {}) as any;
      return {
        ta: Number(d.ta || 0),
        da: Number(d.da || 0),
        additional_approved: Number(d.additional_approved || 0),
        additional_pending: Number(d.additional_pending || 0),
        total: Number(d.total || 0),
        present_days: Number(d.present_days || 0),
        total_km: Number(d.total_km || 0),
        daily: (d.daily || []) as DailyBreakdownRow[],
        weekly: (d.weekly || []) as WeeklyBreakdownRow[],
      };
    },
    staleTime: 60 * 1000,
  });
}
