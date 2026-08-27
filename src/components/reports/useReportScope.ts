import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserProfile } from "@/hooks/useUserProfile";

export interface ScopeUser {
  id: string;
  full_name: string;
}

export interface ReportScope {
  userIds: string[] | null; // null = all users (admin)
  users: ScopeUser[];
  isAdmin: boolean;
  loading: boolean;
  generatedBy: string;
}

/**
 * Resolves which employees the current user may report on.
 * Admins -> all active users (userIds = null, no IN filter needed).
 * Others -> self + reporting subordinates via get_user_hierarchy.
 */
export function useReportScope(): ReportScope {
  const { user } = useCurrentUser();
  const { isAdmin, profile, loading: profileLoading } = useUserProfile();

  const { data, isLoading } = useQuery({
    queryKey: ["report-scope", user?.id, isAdmin],
    enabled: !!user && !profileLoading,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (isAdmin) {
        const { data: all } = await supabase
          .from("users")
          .select("id, full_name")
          .eq("is_active", true)
          .order("full_name");
        return {
          userIds: null as string[] | null,
          users: (all || []).map((u) => ({ id: u.id, full_name: u.full_name || "Unknown" })),
        };
      }

      const { data: subs } = await supabase.rpc("get_user_hierarchy", {
        _manager_id: user!.id,
      });
      const ids = [user!.id, ...((subs || []) as { user_id: string }[]).map((s) => s.user_id)];
      const { data: us } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", ids)
        .order("full_name");
      return {
        userIds: ids,
        users: (us || []).map((u) => ({ id: u.id, full_name: u.full_name || "Unknown" })),
      };
    },
  });

  return {
    userIds: data ? data.userIds : [],
    users: data?.users ?? [],
    isAdmin,
    loading: profileLoading || isLoading,
    generatedBy: profile?.full_name || profile?.username || "Unknown",
  };
}
