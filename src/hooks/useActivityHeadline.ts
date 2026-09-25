import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { activityHeadline } from "@/utils/activityHeadline";

/**
 * The on-screen name of one activity, by id.
 *
 * Used to say which record the travel calculation started from. The id is the
 * authority — two activities on the same day can carry the identical name, so
 * the caller keeps the id and uses this only for what the reader sees.
 *
 * Returns null rather than throwing, so a missing or unreadable record shows
 * the neutral fallback instead of breaking the effort panel.
 */
export function useActivityHeadline(activityId: string | null | undefined) {
  return useQuery({
    queryKey: ["activity-headline", activityId],
    enabled: !!activityId,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("activity_events")
        .select("id, activity_type, activity_name, lead_id, site_id, project_id")
        .eq("id", activityId!)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as any;

      // Same destination fields the card resolves, fetched one at a time
      // because only one of them is ever set.
      let lead_company: string | null = null;
      let lead_name: string | null = null;
      let site_name: string | null = null;
      let project_name: string | null = null;

      if (row.lead_id) {
        const { data: lead } = await supabase
          .from("leads").select("name, company").eq("id", row.lead_id).maybeSingle();
        lead_company = (lead as any)?.company || null;
        lead_name = (lead as any)?.name || null;
      } else if (row.site_id) {
        const { data: site } = await supabase
          .from("project_sites").select("site_name").eq("id", row.site_id).maybeSingle();
        site_name = (site as any)?.site_name || null;
      } else if (row.project_id) {
        const { data: project } = await supabase
          .from("pm_projects").select("name").eq("id", row.project_id).maybeSingle();
        project_name = (project as any)?.name || null;
      }

      return activityHeadline({ ...row, lead_company, lead_name, site_name, project_name });
    },
  });
}
