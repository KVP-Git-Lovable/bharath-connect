import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VehicleRate {
  id: string;
  vehicle_type_id: string;
  per_km_rate: number;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
}

export async function fetchVehicleRates(vehicleTypeId: string): Promise<VehicleRate[]> {
  const { data, error } = await supabase
    .from("vehicle_rate_history" as any)
    .select("id, vehicle_type_id, per_km_rate, effective_from, effective_to, note")
    .eq("vehicle_type_id", vehicleTypeId)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({
    id: r.id,
    vehicle_type_id: r.vehicle_type_id,
    per_km_rate: Number(r.per_km_rate || 0),
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    note: r.note,
  }));
}

export function rateForDate(rates: VehicleRate[], date?: string | null): number {
  if (!rates.length) return 0;
  if (!date) return rates[0].per_km_rate;
  const d = date.slice(0, 10);
  const hit = rates.find((r) => r.effective_from <= d && (!r.effective_to || r.effective_to >= d));
  return hit ? hit.per_km_rate : 0;
}

export function currentVehicleRate(rates: VehicleRate[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return rateForDate(rates, today);
}

export function useVehicleRates(vehicleTypeId: string) {
  const query = useQuery({
    queryKey: ["vehicle-rate-history", vehicleTypeId],
    queryFn: () => fetchVehicleRates(vehicleTypeId),
    staleTime: 5 * 60 * 1000,
    enabled: !!vehicleTypeId,
  });
  const rates = query.data || [];
  return {
    rates,
    loading: query.isLoading,
    refetch: query.refetch,
    currentRate: currentVehicleRate(rates),
  };
}
