import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityTravelExpense {
  method: "fixed" | "from_gps";
  vehicle_id: string | null;
  vehicle_name: string | null;
  vehicle_source: "activity" | "day" | null;
  is_no_vehicle: boolean;
  km: number | null;
  rate: number;
  rate_source: "no_vehicle" | "personal_vehicle" | "vehicle" | "user" | "team" | "row" | "role" | "default";
  amount: number | null;
}

/** Travel expense for one activity, worked out on the server with the same TA rules as payroll. Null if unavailable. */
export function useActivityTravelExpense(activityId: string | undefined) {
  return useQuery({
    queryKey: ["activity-travel-expense", activityId],
    enabled: !!activityId,
    retry: false,
    queryFn: async (): Promise<ActivityTravelExpense | null> => {
      const { data, error } = await supabase.rpc("get_activity_travel_expense" as any, { _activity_id: activityId });
      if (error || !data) return null;
      const d = data as any;
      return {
        ...d,
        km: d.km == null ? null : Number(d.km),
        rate: Number(d.rate || 0),
        amount: d.amount == null ? null : Number(d.amount),
      };
    },
  });
}
