import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SavedReport, SavedReportConfig } from "@/components/reports/reportTypes";

/** Saved report views (filters + columns + charts) for a given report module. */
export function useSavedReports(module: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["saved-reports", module],
    staleTime: 60_000,
    queryFn: async (): Promise<SavedReport[]> => {
      const { data, error } = await supabase
        .from("saved_reports")
        .select("id, module, name, config, is_favourite, updated_at")
        .eq("module", module)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        module: r.module,
        name: r.name,
        config: (r.config || {}) as SavedReportConfig,
        is_favourite: r.is_favourite,
        updated_at: r.updated_at,
      }));
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["saved-reports", module] });

  const save = useMutation({
    mutationFn: async (input: { id?: string; name: string; config: SavedReportConfig }) => {
      if (input.id) {
        const { error } = await supabase
          .from("saved_reports")
          .update({ name: input.name, config: input.config as never })
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("saved_reports")
        .insert({ module, name: input.name, config: input.config as never })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setFavourite = useMutation({
    mutationFn: async (input: { id: string; value: boolean }) => {
      // Only one favourite per module.
      const { error: clearErr } = await supabase
        .from("saved_reports")
        .update({ is_favourite: false })
        .eq("module", module)
        .eq("is_favourite", true);
      if (clearErr) throw clearErr;
      if (input.value) {
        const { error } = await supabase
          .from("saved_reports")
          .update({ is_favourite: true })
          .eq("id", input.id);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  return {
    reports: query.data || [],
    loading: query.isLoading,
    favourite: (query.data || []).find((r) => r.is_favourite) || null,
    save,
    remove,
    setFavourite,
  };
}
