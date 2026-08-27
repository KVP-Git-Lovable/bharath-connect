import { useQuery } from "@tanstack/react-query";
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

  return {
    user: query.data ?? null,
    userId: query.data?.id,
    isLoading: query.isLoading,
  };
}
