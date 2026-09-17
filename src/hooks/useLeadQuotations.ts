import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface LeadQuotation {
  id: string;
  lead_id: string;
  enquiry_number: string | null;
  enquiry_received_date: string | null;
  quotation_number: string | null;
  quotation_date: string | null;
  value_without_gst: number | null;
  followed_by_user_id: string | null;
  followed_by_name: string | null;
  status_id: string | null;
  status_name: string | null;
  po_date: string | null;
  po_number: string | null;
  po_amount: number | null;
  remarks: string | null;
}

export function useLeadQuotations(leadId: string | undefined) {
  const [quotations, setQuotations] = useState<LeadQuotation[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!leadId) { setQuotations([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("lead_quotations" as any)
      .select("*")
      .eq("lead_id", leadId)
      .order("quotation_date", { ascending: false, nullsFirst: false });
    if (error) { console.error("[lead quotations] load failed:", error); setQuotations([]); }
    else setQuotations((data || []) as any as LeadQuotation[]);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { refetch(); }, [refetch]);

  const upsert = useCallback(async (row: Partial<LeadQuotation> & { id?: string }) => {
    if (!leadId) return false;
    const payload = { ...row, lead_id: leadId };
    const { error } = row.id
      ? await supabase.from("lead_quotations" as any).update(payload as any).eq("id", row.id)
      : await supabase.from("lead_quotations" as any).insert(payload as any);
    if (error) { toast.error(error.message || "Could not save the quotation"); return false; }
    await refetch();
    return true;
  }, [leadId, refetch]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("lead_quotations" as any).delete().eq("id", id);
    if (error) { toast.error(error.message || "Could not delete the quotation"); return false; }
    await refetch();
    return true;
  }, [refetch]);

  return { quotations, loading, refetch, upsert, remove };
}
