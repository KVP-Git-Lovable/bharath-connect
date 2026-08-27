import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Customer {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  owner_id: string | null;
  primary_contact_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Customers ----------
export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useCustomer(id?: string) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Customer;
    },
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<Customer>) => {
      const { data, error } = await supabase.from("customers").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.success("Customer created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...v }: Partial<Customer> & { id: string }) => {
      const { data, error } = await supabase.from("customers").update(v).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer", d.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}


export interface Opportunity {
  id: string;
  customer_id: string | null;
  name: string;
  type: string | null;
  stage: string | null;
  probability: number;
  close_date: string | null;
  amount: number;
  owner_id: string | null;
  currency: string | null;
  payment_terms: string | null;
  opportunity_source_id: string | null;
  requirements_highlights: string | null;
  budget_status: string | null;
  authority_role: string | null;
  need_level: string | null;
  timeline: string | null;
  primary_contact_id: string | null;
  stage_changed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  customer_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  reports_to_id: string | null;
  last_contact_at: string | null;
  created_at: string;
}

export interface Milestone {
  id: string;
  opportunity_id: string;
  name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_value: number;
  status: string;
  created_at: string;
}

export interface CustomerActivity {
  id: string;
  customer_id: string | null;
  opportunity_id: string | null;
  type: string;
  subject: string;
  notes: string | null;
  activity_date: string;
  outcome: string | null;
  lead_id?: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CustomerDocument {
  id: string;
  customer_id: string | null;
  opportunity_id: string | null;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface OppType { id: string; name: string; sort_order: number; is_active: boolean }
export interface OppStage {
  id: string; name: string; color: string; sort_order: number;
  is_won: boolean; is_closed: boolean; is_active: boolean;
}

// ---------- Opportunities ----------
export function useOpportunities(customerId?: string) {
  return useQuery({
    queryKey: ["opportunities", customerId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("customer_opportunities").select("*").order("updated_at", { ascending: false });
      if (customerId) q = q.eq("customer_id", customerId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Opportunity[];
    },
  });
}


export function useOpportunity(id?: string) {
  return useQuery({
    queryKey: ["opportunity", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_opportunities").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Opportunity;
    },
    enabled: !!id,
  });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<Opportunity>) => {
      const { data, error } = await supabase.from("customer_opportunities").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["opportunities"] }); toast.success("Opportunity created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...v }: Partial<Opportunity> & { id: string }) => {
      const { data, error } = await supabase.from("customer_opportunities").update(v).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity", d.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_opportunities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["opportunities"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Milestones ----------
export function useMilestones(oppId?: string) {
  return useQuery({
    queryKey: ["milestones", oppId],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunity_milestones").select("*")
        .eq("opportunity_id", oppId!).order("created_at");
      if (error) throw error;
      return data as Milestone[];
    },
    enabled: !!oppId,
  });
}

export function useCreateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<Milestone>) => {
      const { data, error } = await supabase.from("opportunity_milestones").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["milestones", d.opportunity_id] }); toast.success("Milestone added"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...v }: Partial<Milestone> & { id: string }) => {
      const { data, error } = await supabase.from("opportunity_milestones").update(v).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => qc.invalidateQueries({ queryKey: ["milestones", d.opportunity_id] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, oppId }: { id: string; oppId: string }) => {
      const { error } = await supabase.from("opportunity_milestones").delete().eq("id", id);
      if (error) throw error;
      return oppId;
    },
    onSuccess: (oppId) => qc.invalidateQueries({ queryKey: ["milestones", oppId] }),
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Contacts ----------
export function useContacts(customerId?: string) {
  return useQuery({
    queryKey: ["contacts", customerId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("customer_contacts").select("*").order("name");
      if (customerId) q = q.eq("customer_id", customerId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Contact[];
    },
  });
}


export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<Contact>) => {
      const { data, error } = await supabase.from("customer_contacts").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); toast.success("Contact added"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...v }: Partial<Contact> & { id: string }) => {
      const { data, error } = await supabase.from("customer_contacts").update(v).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Contact Roles ----------
export interface ContactRole {
  id: string;
  customer_id: string;
  contact_id: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export const CONTACT_ROLE_OPTIONS = [
  "Decision Maker",
  "Influencer",
  "Technical Evaluator",
  "Procurement",
  "Finance",
  "Project Manager",
  "End User",
  "Other",
];

export function useContactRoles(customerId?: string) {
  return useQuery({
    queryKey: ["contact-roles", customerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("customer_contact_roles")
        .select("*").eq("customer_id", customerId!).order("created_at");
      if (error) throw error;
      return (data || []) as ContactRole[];
    },
    enabled: !!customerId,
  });
}

export function useUpsertContactRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: string; customer_id: string; contact_id: string; role: string }) => {
      if (v.id) {
        const { error } = await (supabase as any).from("customer_contact_roles")
          .update({ contact_id: v.contact_id, role: v.role }).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("customer_contact_roles")
          .insert({ customer_id: v.customer_id, contact_id: v.contact_id, role: v.role });
        if (error) throw error;
      }
      return v.customer_id;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ["contact-roles", cid] });
      toast.success("Contact role saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteContactRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, customer_id }: { id: string; customer_id: string }) => {
      const { error } = await (supabase as any).from("customer_contact_roles").delete().eq("id", id);
      if (error) throw error;
      return customer_id;
    },
    onSuccess: (cid) => { qc.invalidateQueries({ queryKey: ["contact-roles", cid] }); toast.success("Removed"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useSetPrimaryContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customer_id, contact_id }: { customer_id: string; contact_id: string | null }) => {
      const { error } = await supabase.from("customers")
        .update({ primary_contact_id: contact_id } as any).eq("id", customer_id);
      if (error) throw error;
      return customer_id;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ["customer", cid] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Primary contact updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Activities ----------
export function useCustomerActivities(scope?: { opportunityId?: string; customerId?: string; leadId?: string } | string) {
  const s = typeof scope === "string" ? { opportunityId: scope } : (scope || {});
  return useQuery({
    queryKey: ["customer-activities", s.opportunityId ?? "all", s.customerId ?? "all", (s as any).leadId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("customer_activities").select("*").order("activity_date", { ascending: false });
      if (s.opportunityId) q = q.eq("opportunity_id", s.opportunityId);
      if (s.customerId) q = q.eq("customer_id", s.customerId);
      if ((s as any).leadId) q = q.eq("lead_id", (s as any).leadId);
      const { data, error } = await q;
      if (error) throw error;
      return data as CustomerActivity[];
    },
  });
}


export function useCreateCustomerActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<CustomerActivity>) => {
      const { data, error } = await supabase.from("customer_activities").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-activities"] });
      toast.success("Activity added");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Documents ----------
export function useCustomerDocuments(scope?: { opportunityId?: string; customerId?: string } | string) {
  const s = typeof scope === "string" ? { opportunityId: scope } : (scope || {});
  return useQuery({
    queryKey: ["customer-documents", s.opportunityId ?? "all", s.customerId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("customer_documents").select("*").order("created_at", { ascending: false });
      if (s.opportunityId) q = q.eq("opportunity_id", s.opportunityId);
      if (s.customerId) q = q.eq("customer_id", s.customerId);
      const { data, error } = await q;
      if (error) throw error;
      return data as CustomerDocument[];
    },
  });
}


export function useCreateCustomerDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<CustomerDocument>) => {
      const { data, error } = await supabase.from("customer_documents").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-documents"] });
      toast.success("Document uploaded");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteCustomerDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fileUrl }: { id: string; fileUrl: string }) => {
      await supabase.storage.from("customer-documents").remove([fileUrl]);
      const { error } = await supabase.from("customer_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-documents"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Master data ----------
export function useOppTypes() {
  return useQuery({
    queryKey: ["opp-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunity_types").select("*")
        .eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data as OppType[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useOppStages() {
  return useQuery({
    queryKey: ["opp-stages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunity_stages").select("*")
        .eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data as OppStage[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------- Users for owner picker ----------
export function useUserLookup() {
  return useQuery({
    queryKey: ["users-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users")
        .select("id, full_name, username, email").eq("is_active", true).order("full_name");
      if (error) throw error;
      return (data || []) as { id: string; full_name: string | null; username: string | null; email: string | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function stageColorClasses(color?: string) {
  switch (color) {
    case "blue":  return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "amber": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "green": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "red":   return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
    case "purple":return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    default:      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

// ---------- Quotes ----------
export interface QuoteItem {
  id?: string;
  quote_id?: string;
  product_id: string | null;
  product_name: string | null;
  qty: number;
  unit_price: number;
  uom: string | null;
  start_date: string | null;
  end_date: string | null;
  term_months: number | null;
  discount_pct: number;
  total: number;
  sort_order: number;
}
export interface Quote {
  id: string;
  opportunity_id: string;
  name: string;
  notes: string | null;
  total: number;
  overall_discount_pct: number;
  is_synced: boolean;
  created_at: string;
  updated_at: string;
  items?: { product_name: string | null; sort_order: number }[];
}

export function useQuotes(oppId?: string) {
  return useQuery({
    queryKey: ["quotes", oppId],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunity_quotes" as any)
        .select("*, items:opportunity_quote_items(product_name, sort_order)")
        .eq("opportunity_id", oppId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Quote[];
    },
    enabled: !!oppId,
  });
}

export function useToggleQuoteSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, oppId, sync }: { id: string; oppId: string; sync: boolean }) => {
      if (sync) {
        const { error: clearErr } = await supabase.from("opportunity_quotes" as any)
          .update({ is_synced: false } as any)
          .eq("opportunity_id", oppId)
          .neq("id", id);
        if (clearErr) throw clearErr;
      }
      const { error } = await supabase.from("opportunity_quotes" as any)
        .update({ is_synced: sync } as any).eq("id", id);
      if (error) throw error;
      return { oppId };
    },
    onSuccess: ({ oppId }) => {
      qc.invalidateQueries({ queryKey: ["quotes", oppId] });
      qc.invalidateQueries({ queryKey: ["opportunity", oppId] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      toast.success("Sync updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQuoteItems(quoteId?: string) {
  return useQuery({
    queryKey: ["quote-items", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunity_quote_items" as any).select("*")
        .eq("quote_id", quoteId!).order("sort_order");
      if (error) throw error;
      return data as unknown as QuoteItem[];
    },
    enabled: !!quoteId,
  });
}

export function useSaveQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      opportunity_id: string;
      name: string;
      notes: string | null;
      total: number;
      overall_discount_pct: number;
      is_synced?: boolean;
      items: QuoteItem[];
    }) => {
      let quoteId = payload.id;
      const baseFields: any = {
        name: payload.name, notes: payload.notes, total: payload.total,
        overall_discount_pct: payload.overall_discount_pct,
      };
      if (payload.is_synced !== undefined) baseFields.is_synced = payload.is_synced;
      if (payload.is_synced === true) {
        const clearQuery = supabase.from("opportunity_quotes" as any)
          .update({ is_synced: false } as any)
          .eq("opportunity_id", payload.opportunity_id);
        const { error: clearErr } = quoteId
          ? await clearQuery.neq("id", quoteId)
          : await clearQuery;
        if (clearErr) throw clearErr;
      }
      if (quoteId) {
        const { error } = await supabase.from("opportunity_quotes" as any)
          .update(baseFields).eq("id", quoteId);
        if (error) throw error;
        await supabase.from("opportunity_quote_items" as any).delete().eq("quote_id", quoteId);
      } else {
        const { data, error } = await supabase.from("opportunity_quotes" as any).insert({
          opportunity_id: payload.opportunity_id,
          ...baseFields,
        } as any).select().single();
        if (error) throw error;
        quoteId = (data as any).id;
      }
      if (payload.items.length) {
        const rows = payload.items.map((it, i) => ({
          quote_id: quoteId,
          product_id: it.product_id,
          product_name: it.product_name,
          qty: it.qty,
          unit_price: it.unit_price,
          uom: it.uom,
          start_date: it.start_date,
          end_date: it.end_date,
          term_months: it.term_months,
          discount_pct: it.discount_pct,
          total: it.total,
          sort_order: i,
        }));
        const { error } = await supabase.from("opportunity_quote_items" as any).insert(rows as any);
        if (error) throw error;
      }
      return { id: quoteId, opportunity_id: payload.opportunity_id };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["quotes", d.opportunity_id] });
      qc.invalidateQueries({ queryKey: ["quote-items", d.id] });
      qc.invalidateQueries({ queryKey: ["opportunity", d.opportunity_id] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      toast.success("Quote saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, oppId }: { id: string; oppId: string }) => {
      const { error } = await supabase.from("opportunity_quotes" as any).delete().eq("id", id);
      if (error) throw error;
      return oppId;
    },
    onSuccess: (oppId) => { qc.invalidateQueries({ queryKey: ["quotes", oppId] }); toast.success("Quote deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCloneQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, oppId }: { id: string; oppId: string }) => {
      const { data: src, error: e1 } = await supabase.from("opportunity_quotes" as any)
        .select("*").eq("id", id).single();
      if (e1) throw e1;
      const s: any = src;
      const { data: items, error: e2 } = await supabase.from("opportunity_quote_items" as any)
        .select("*").eq("quote_id", id).order("sort_order");
      if (e2) throw e2;
      const { data: newQ, error: e3 } = await supabase.from("opportunity_quotes" as any).insert({
        opportunity_id: s.opportunity_id,
        name: `${s.name} (Copy)`,
        notes: s.notes,
        total: s.total,
        overall_discount_pct: s.overall_discount_pct,
        is_synced: false,
      } as any).select().single();
      if (e3) throw e3;
      const newId = (newQ as any).id;
      if (items && items.length) {
        const rows = (items as any[]).map((it, i) => ({
          quote_id: newId,
          product_id: it.product_id,
          product_name: it.product_name,
          qty: it.qty,
          unit_price: it.unit_price,
          uom: it.uom,
          start_date: it.start_date,
          end_date: it.end_date,
          term_months: it.term_months,
          discount_pct: it.discount_pct,
          total: it.total,
          sort_order: i,
        }));
        const { error: e4 } = await supabase.from("opportunity_quote_items" as any).insert(rows as any);
        if (e4) throw e4;
      }
      return oppId;
    },
    onSuccess: (oppId) => { qc.invalidateQueries({ queryKey: ["quotes", oppId] }); toast.success("Quote cloned"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export interface MasterProduct {
  id: string;
  product_name: string;
  default_uom: string | null;
  default_unit_price: number;
  is_active: boolean;
}
export function useMasterProducts() {
  return useQuery({
    queryKey: ["master-products-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_products")
        .select("id, product_name, default_uom, default_unit_price, is_active")
        .eq("is_active", true).order("product_name");
      if (error) throw error;
      return data as MasterProduct[];
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

export function useAddMasterProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ product_name, default_unit_price }: { product_name: string; default_unit_price: number }) => {
      const { data, error } = await supabase.from("master_products")
        .insert({ product_name: product_name.trim(), default_unit_price: Number(default_unit_price) || 0, is_active: true })
        .select("id, product_name, default_uom, default_unit_price, is_active")
        .single();
      if (error) throw error;
      return data as MasterProduct;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["master-products-active"] }); },
  });
}


