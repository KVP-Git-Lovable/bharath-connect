import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CurrencyRow { id: string; code: string; symbol: string; name: string; is_active: boolean; sort_order: number; }
export interface PaymentTermRow { id: string; name: string; is_active: boolean; sort_order: number; }

export function useCurrencies(activeOnly = true) {
  return useQuery({
    queryKey: ["master-currencies", activeOnly],
    queryFn: async () => {
      let q = supabase.from("master_currencies" as any).select("*").order("sort_order");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CurrencyRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePaymentTerms(activeOnly = true) {
  return useQuery({
    queryKey: ["master-payment-terms", activeOnly],
    queryFn: async () => {
      let q = supabase.from("master_payment_terms" as any).select("*").order("sort_order");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PaymentTermRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function currencySymbol(currencies: CurrencyRow[], code?: string | null): string {
  if (!code) return "₹";
  const c = currencies.find((x) => x.code === code);
  return c?.symbol ?? code;
}

export function formatMoney(currencies: CurrencyRow[], code: string | null | undefined, amount: number | null | undefined): string {
  const sym = currencySymbol(currencies, code);
  const n = Number(amount || 0).toLocaleString();
  return `${sym} ${n}`;
}
