import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { eachMonthOfInterval, format } from "date-fns";

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

export interface RangeExpenseSummary {
  ta: number;
  da: number;
  present_days: number;
  total_km: number;
  daily: DailyBreakdownRow[];
}

/**
 * Expense summary over an arbitrary date range, potentially spanning
 * multiple calendar months. get_monthly_expense_summary only accepts a
 * single month, so this calls it once per month in the range and merges
 * the results client-side, clipping the daily rows (and re-summing ta/da
 * from those clipped rows) to the exact [start, end] window so a
 * partial-month range doesn't pull in days outside it.
 *
 * Deliberately excludes additional-expense totals: those aggregate at the
 * whole-month level server-side and can't be clipped to a partial-month
 * range the same way. The caller should derive additional-expense totals
 * from its own range-filtered `additional_expenses` query instead.
 */
export function useExpenseSummaryRange(userId: string | undefined, start: Date, end: Date) {
  // Guard against an inverted range (e.g. a custom "From" date after "To") —
  // eachMonthOfInterval throws on an invalid interval instead of returning [].
  const valid = start <= end;
  const startStr = format(valid ? start : end, "yyyy-MM-dd");
  const endStr = format(valid ? end : start, "yyyy-MM-dd");
  const months = valid ? eachMonthOfInterval({ start, end }).map((d) => format(d, "yyyy-MM")) : [];

  return useQuery({
    enabled: !!userId && months.length > 0,
    queryKey: ["expense-summary-range", userId, startStr, endStr],
    queryFn: async (): Promise<RangeExpenseSummary> => {
      const results = await Promise.all(
        months.map(async (yearMonth) => {
          const { data, error } = await supabase.rpc("get_monthly_expense_summary" as any, {
            _user_id: userId,
            _year_month: yearMonth,
          });
          if (error) throw error;
          return (data || {}) as any;
        })
      );

      const allDaily = results.flatMap((d) => (d.daily || []) as DailyBreakdownRow[]);
      const daily = allDaily.filter((d) => d.date >= startStr && d.date <= endStr);

      return {
        ta: daily.reduce((s, d) => s + Number(d.ta || 0), 0),
        da: daily.reduce((s, d) => s + Number(d.da || 0), 0),
        present_days: daily.reduce((s, d) => s + Number(d.present || 0), 0),
        total_km: daily.reduce((s, d) => s + Number(d.km || 0), 0),
        daily,
      };
    },
    staleTime: 60 * 1000,
  });
}
