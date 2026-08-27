import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TeamMember {
  id: string;
  full_name: string;
}

export function useGPSTeamMembers() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setCurrentUserId(user.id);

      // Check if admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      const admin = roleData?.role === "admin";
      if (!cancelled) setIsAdmin(admin);

      if (admin) {
        // Admin sees all active users
        const { data } = await supabase
          .from("users")
          .select("id, full_name")
          .eq("is_active", true)
          .order("full_name");
        if (!cancelled) setTeamMembers((data || []).map((u: any) => ({ id: u.id, full_name: u.full_name || u.id })));
      } else {
        // Get subordinates via hierarchy
        const { data: subs } = await supabase.rpc("get_user_hierarchy", { _manager_id: user.id });
        if (subs && subs.length > 0) {
          const subIds = subs.map((s: any) => s.user_id);
          const { data } = await supabase
            .from("users")
            .select("id, full_name")
            .in("id", subIds)
            .eq("is_active", true)
            .order("full_name");
          if (!cancelled) setTeamMembers((data || []).map((u: any) => ({ id: u.id, full_name: u.full_name || u.id })));
        }
      }
      if (!cancelled) setLoading(false);
    };

    init();
    return () => { cancelled = true; };
  }, []);

  return { currentUserId, isAdmin, teamMembers, loading };
}
