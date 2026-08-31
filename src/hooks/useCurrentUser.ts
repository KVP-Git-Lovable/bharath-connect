import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Shared hook — single auth call cached across all components.
 * Returns the authenticated user from Supabase auth, cached by React Query.
 */
export function useCurrentUser() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["current-user"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      return { id: user.id, email: user.email ?? "" };
    },
    staleTime: 30 * 60 * 1000, // auth doesn't change often
    gcTime: 60 * 60 * 1000,
  });

  // Identity changes (sign-in / sign-out / account switch) must wipe the cache.
  // Without this, role, security-profile and permission data cached for the
  // previous account keeps driving the UI until a hard reload.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const nextId = session?.user?.id ?? null;
      const cachedId = (queryClient.getQueryData(["current-user"]) as CurrentUser | null)?.id ?? null;
      if (nextId === cachedId && event !== "USER_UPDATED") return;
      queryClient.clear();
      queryClient.setQueryData(
        ["current-user"],
        nextId ? { id: nextId, email: session?.user?.email ?? "" } : null
      );
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return {
    user: query.data ?? null,
    userId: query.data?.id,
    isLoading: query.isLoading,
  };
}
