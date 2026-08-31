import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaRate {
  id: string;
  per_km_rate: number;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
}

export async function fetchTaRates(): Promise<TaRate[]> {
  const { data, error } = await supabase
    .from("ta_rate_history" as any)
    .select("id, per_km_rate, effective_from, effective_to, note")
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({
    id: r.id,
    per_km_rate: Number(r.per_km_rate || 0),
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    note: r.note,
  }));
}

/** Rate that applied on a given date (yyyy-MM-dd). Falls back to the newest rate. */
export function rateForDate(rates: TaRate[], date?: string | null): number {
  if (!rates.length) return 0;
  if (!date) return rates[0].per_km_rate;
  const d = date.slice(0, 10);
  const hit = rates.find(
    (r) => r.effective_from <= d && (!r.effective_to || r.effective_to >= d)
  );
  return hit ? hit.per_km_rate : 0;
}

export function currentTaRate(rates: TaRate[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return rateForDate(rates, today);
}

export function useTaRates() {
  const query = useQuery({
    queryKey: ["ta-rate-history"],
    queryFn: fetchTaRates,
    staleTime: 5 * 60 * 1000,
  });
  const rates = query.data || [];
  return {
    rates,
    loading: query.isLoading,
    refetch: query.refetch,
    rateFor: (date?: string | null) => rateForDate(rates, date),
    currentRate: currentTaRate(rates),
  };
}
