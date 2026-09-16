import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VehicleType {
  id: string;
  name: string;
  icon: string | null;
  is_no_vehicle: boolean;
  is_active: boolean;
  sort_order: number;
}

export async function fetchVehicleTypes(): Promise<VehicleType[]> {
  const { data, error } = await supabase
    .from("vehicle_types" as any)
    .select("id, name, icon, is_no_vehicle, is_active, sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data || []) as any as VehicleType[];
}

export function useVehicleTypes(activeOnly = true) {
  const query = useQuery({
    queryKey: ["vehicle-types"],
    queryFn: fetchVehicleTypes,
    staleTime: 5 * 60 * 1000,
  });
  const all = query.data || [];
  return {
    vehicleTypes: activeOnly ? all.filter((v) => v.is_active) : all,
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
