import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UomOption {
  id: string;
  uom_name: string;
  short_code: string;
  is_active: boolean;
  sort_order: number;
}

export function useUomOptions(activeOnly = true) {
  return useQuery({
    queryKey: ["uom-master", activeOnly],
    queryFn: async (): Promise<UomOption[]> => {
      let q = supabase.from("master_uom").select("id, uom_name, short_code, is_active, sort_order").order("sort_order").order("uom_name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as UomOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
