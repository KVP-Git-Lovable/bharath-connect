import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const ACTIVITY_OUTCOMES = [
  "Not started",
  "Productive",
  "Unproductive",
  "Visited but not available",
  "Postponed",
  "Cancelled",
];

export interface LeadActivity {
  id: string;
  lead_id: string | null;
  activity_name: string;
  activity_type: string;
  activity_date: string;
  description: string | null;
  outcome: string | null;
  status: string;
  created_at: string;
}

/** Activity types shared with the calendar / Activities module */
export function useActivityTypeOptions() {
  return useQuery({
    queryKey: ["activity-type-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_types_master")
        .select("name, is_active, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || [])
        .filter((t: any) => t.is_active !== false)
        .map((t: any) => t.name as string);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Activities recorded against a lead — same table the calendar/Activities module uses */
export function useLeadActivities(leadId?: string) {
  return useQuery({
    queryKey: ["lead-activities", leadId ?? "none"],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_events")
        .select("*")
        .eq("lead_id", leadId!)
        .order("activity_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LeadActivity[];
    },
  });
}

export function useCreateLeadActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      lead_id: string;
      activity_type: string;
      activity_name: string;
      activity_date: string;
      description?: string | null;
      outcome?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("activity_events")
        .insert({
          user_id: user.id,
          lead_id: v.lead_id,
          activity_type: v.activity_type,
          activity_name: v.activity_name,
          activity_date: v.activity_date,
          description: v.description || null,
          outcome: v.outcome || null,
          status: "completed",
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-activities"] });
      toast.success("Activity added");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateLeadActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      activity_type?: string;
      activity_name?: string;
      activity_date?: string;
      description?: string | null;
      outcome?: string | null;
    }) => {
      const { id, ...rest } = v;
      const { data, error } = await supabase
        .from("activity_events")
        .update(rest as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-activities"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Activity updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
