import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============ Master data ============
export interface EventType { id: string; name: string; sort_order: number; is_active: boolean; }
export interface LeadStatus { id: string; name: string; color: string; sort_order: number; is_active: boolean; is_converted_status: boolean; }
export interface LeadSource { id: string; name: string; sort_order: number; is_active: boolean; }
export interface Industry { id: string; name: string; sort_order: number; is_active: boolean; }

export function useEventTypes(activeOnly = true) {
  return useQuery({
    queryKey: ["event-types", activeOnly],
    queryFn: async () => {
      let q = supabase.from("master_event_types" as any).select("*").order("sort_order");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as EventType[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeadStatuses(activeOnly = true) {
  return useQuery({
    queryKey: ["lead-statuses", activeOnly],
    queryFn: async () => {
      let q = supabase.from("master_lead_statuses" as any).select("*").order("sort_order");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as LeadStatus[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeadSources(activeOnly = true) {
  return useQuery({
    queryKey: ["lead-sources", activeOnly],
    queryFn: async () => {
      let q = supabase.from("master_lead_sources" as any).select("*").order("sort_order");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as LeadSource[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useIndustries(activeOnly = true) {
  return useQuery({
    queryKey: ["industries", activeOnly],
    queryFn: async () => {
      let q = supabase.from("master_industries" as any).select("*").order("sort_order");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Industry[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ============ Events ============
export interface EventRow {
  id: string;
  name: string;
  event_type_id: string | null;
  budget_amount: number;
  actual_amount: number;
  start_date: string | null;
  end_date: string | null;
  event_details: string | null;
  expected_end_result: string | null;
  owner_id: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events" as any).select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return data as unknown as EventRow[];
    },
  });
}

export function useEvent(id?: string) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("events" as any).select("*").eq("id", id!).single();
      if (error) throw error;
      return data as unknown as EventRow;
    },
    enabled: !!id,
  });
}

export function useSaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<EventRow> & { id?: string }) => {
      const { id, ...rest } = v;
      if (id) {
        const { data, error } = await supabase.from("events" as any).update(rest as any).eq("id", id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("events" as any).insert(rest as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); toast.success("Event saved"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); toast.success("Event deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function eventStatus(e: EventRow): "Upcoming" | "Ongoing" | "Completed" | "Undated" {
  if (!e.start_date && !e.end_date) return "Undated";
  const now = new Date();
  const start = e.start_date ? new Date(e.start_date) : null;
  const end = e.end_date ? new Date(e.end_date) : null;
  if (end && end < now) return "Completed";
  if (start && start > now) return "Upcoming";
  return "Ongoing";
}

// ============ Leads ============
export interface LeadRow {
  id: string;
  owner_id: string | null;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  industry: string | null;
  lead_status_id: string | null;
  lead_source_id: string | null;
  related_event_id: string | null;
  business_card_url: string | null;
  converted_customer_id: string | null;
  converted_at: string | null;
  created_by: string | null;
  contact_role: string | null;
  target_first_contact_date: string | null;
  actual_first_contact_date: string | null;
  target_conversion_date: string | null;
  researched_information: string | null;
  created_at: string;
  updated_at: string;
}

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as LeadRow[];
    },
  });
}

export function useLead(id?: string) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads" as any).select("*").eq("id", id!).single();
      if (error) throw error;
      return data as unknown as LeadRow;
    },
    enabled: !!id,
  });
}

export function useSaveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<LeadRow> & { id?: string }) => {
      const { id, ...rest } = v;
      if (id) {
        const { data, error } = await supabase.from("leads" as any).update(rest as any).eq("id", id).select().single();
        if (error) throw error;
        return data;
      }
      // Always stamp ownership from the live auth session so the insert satisfies RLS
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired. Please sign in again to create a lead.");
      const payload = {
        ...(rest as any),
        owner_id: (rest as any).owner_id ?? user.id,
        created_by: (rest as any).created_by ?? user.id,
      };
      const { data, error } = await supabase.from("leads" as any).insert(payload).select().single();
      if (error) throw error;
      return data;
    },

    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      if (data?.id) {
        qc.invalidateQueries({ queryKey: ["lead", data.id] });
        qc.invalidateQueries({ queryKey: ["lead-audit", data.id] });
      }
      toast.success("Lead saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Lead deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useLeadAuditLog(leadId?: string) {
  return useQuery({
    queryKey: ["lead-audit", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_audit_log" as any).select("*")
        .eq("lead_id", leadId!).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (actorIds.length) {
        const { data: usrs } = await supabase.from("users").select("id, full_name, username, email").in("id", actorIds);
        nameMap = Object.fromEntries((usrs ?? []).map((p: any) => [p.id, p.full_name || p.username || p.email || ""]));
        const missing = actorIds.filter((id) => !nameMap[id]);
        if (missing.length) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name, username").in("id", missing);
          (profs ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name || p.username || ""; });
        }
      }
      return rows.map((r) => ({ ...r, actor_name: r.actor_id ? (nameMap[r.actor_id] || "Unknown user") : "System" }));
    },
    enabled: !!leadId,
  });
}

export function useLeadsForEvent(eventId?: string) {
  return useQuery({
    queryKey: ["leads-for-event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads" as any).select("*")
        .eq("related_event_id", eventId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as LeadRow[];
    },
    enabled: !!eventId,
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, payload }: { leadId: string; payload: Record<string, any> }) => {
      const { data, error } = await supabase.rpc("convert_lead" as any, { _lead_id: leadId, _payload: payload });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success("Lead converted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function statusColorClasses(color?: string) {
  switch (color) {
    case "blue":  return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "amber": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "green": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "red":   return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
    case "purple":return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    default:      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}
