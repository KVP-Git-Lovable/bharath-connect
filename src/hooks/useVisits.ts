import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { getCurrentPosition } from "@/utils/nativePermissions";

export function useVisits(userId: string | undefined, selectedDate: string) {
  const queryClient = useQueryClient();

  const visitsQuery = useQuery({
    queryKey: ["visits", userId, selectedDate],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("visits")
        .select("*, retailers(name, address, phone)")
        .eq("user_id", userId)
        .eq("planned_date", selectedDate)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const retailersQuery = useQuery({
    queryKey: ["retailers", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("retailers")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const beatPlansQuery = useQuery({
    queryKey: ["beat-plans", userId, selectedDate],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("beat_plans")
        .select("*")
        .eq("user_id", userId)
        .eq("plan_date", selectedDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const createVisit = useMutation({
    mutationFn: async (input: { retailer_id: string; planned_date: string }) => {
      if (!userId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("visits")
        .insert({
          user_id: userId,
          retailer_id: input.retailer_id,
          planned_date: input.planned_date,
          status: "planned",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
    },
  });

  const updateVisitStatus = useMutation({
    mutationFn: async ({ visitId, status }: { visitId: string; status: string }) => {
      const { error } = await supabase
        .from("visits")
        .update({ status })
        .eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
    },
  });

  const checkInVisit = useMutation({
    mutationFn: async (visitId: string) => {
      let location: any = null;
      try {
        location = await getCurrentPosition();
      } catch {}

      const { error } = await supabase
        .from("visits")
        .update({
          check_in_time: new Date().toISOString(),
          check_in_location: location,
          status: "in_progress",
        })
        .eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
    },
  });

  const checkOutVisit = useMutation({
    mutationFn: async (visitId: string) => {
      let location: any = null;
      try {
        location = await getCurrentPosition();
      } catch {}

      const { error } = await supabase
        .from("visits")
        .update({
          check_out_time: new Date().toISOString(),
          check_out_location: location,
          status: "completed",
        })
        .eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
    },
  });

  return {
    visits: visitsQuery.data || [],
    retailers: retailersQuery.data || [],
    beatPlans: beatPlansQuery.data || [],
    isLoading: visitsQuery.isLoading,
    createVisit,
    updateVisitStatus,
    checkInVisit,
    checkOutVisit,
  };
}
