import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Two people paid separately for what may have been one journey. */
export interface SharedTravelFlag {
  activity_date: string;
  destination: string;
  a_activity_id: string;
  a_user_id: string;
  a_name: string;
  a_amount: number;
  b_activity_id: string;
  b_user_id: string;
  b_name: string;
  b_amount: number;
}

/**
 * Possible duplicate travel claims for a month, for the approver to check.
 *
 * Returns an empty list rather than throwing when the function is missing, so
 * the Team expenses screen still works before the migration is applied.
 */
export function useUndeclaredSharedTravel(yearMonth: string) {
  return useQuery({
    queryKey: ["undeclared-shared-travel", yearMonth],
    enabled: !!yearMonth,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SharedTravelFlag[]> => {
      const { data, error } = await supabase.rpc("find_undeclared_shared_travel" as any, {
        _year_month: yearMonth,
      });
      if (error) return [];
      return ((data as any[]) || []).map((r) => ({
        ...r,
        a_amount: Number(r.a_amount || 0),
        b_amount: Number(r.b_amount || 0),
      })) as SharedTravelFlag[];
    },
  });
}
