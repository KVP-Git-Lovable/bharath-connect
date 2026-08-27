import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityOutcome {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export function useOutcomes(activeOnly = true) {
  return useQuery({
    queryKey: ["activity-outcomes", activeOnly],
    queryFn: async () => {
      let q = supabase.from("master_activity_outcomes" as any).select("*").order("sort_order");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ActivityOutcome[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
