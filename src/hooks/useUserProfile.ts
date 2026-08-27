import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";

interface UserProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  profile_picture_url: string | null;
  phone_number: string | null;
}

interface UserProfileState {
  profile: UserProfile | null;
  role: string | null;
  roleName: string | null;
  isAdmin: boolean;
  loading: boolean;
  initials: string;
  displayRole: string | null;
}

const ADMIN_PROFILE_NAMES = ["administrator", "system administrator"];

function isAdminProfileName(name?: string | null): boolean {
  return !!name && ADMIN_PROFILE_NAMES.includes(name.trim().toLowerCase());
}

function isAdminRoleName(name?: string | null): boolean {
  return !!name && ["admin", "administrator"].includes(name.trim().toLowerCase());
}

export function useUserProfile(): UserProfileState {
  const { user } = useCurrentUser();

  // Primary query — only the data needed for first paint (name, avatar, role flag).
  // Use isPending (not isLoading): this query is `enabled: !!user`, and while
  // useCurrentUser() is still resolving, isLoading is false (nothing is
  // actively fetching yet) even though we have no profile data — which made
  // callers render the "no name yet" fallback as if it were real.
  const { data, isPending } = useQuery({
    queryKey: ["user-profile-core", user?.id],
    queryFn: async () => {
      if (!user) return null;

      try {
        // Fetch profile and all role-related data
        const [profileRes, userRes, secProfileRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, username, profile_picture_url, phone_number")
            .eq("id", user.id)
            .single(),
          supabase
            .from("users")
            .select("role_id, roles(name)")
            .eq("id", user.id)
            .single(),
          supabase
            .from("user_security_profiles")
            .select("security_profiles(name)")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        const profile: UserProfile = profileRes.data ?? {
          id: user.id,
          full_name: null,
          username: null,
          profile_picture_url: null,
          phone_number: null,
        };

        // Determine role - check multiple sources
        let role = "user";
        let displayRole: string | null = null;
        const roleData = userRes.data as { roles?: { name?: string } | null } | null;
        const secProfileData = secProfileRes.data as { security_profiles?: { name?: string } | null } | null;

        // Get display role from roles table
        displayRole = roleData?.roles?.name ?? null;

        // Check if user is admin through any method
        if (
          isAdminRoleName(roleData?.roles?.name) ||
          isAdminProfileName(secProfileData?.security_profiles?.name)
        ) {
          role = "admin";
        }

        if (import.meta.env.DEV) {
          console.log("User profile loaded:", {
            userId: user.id,
            role,
            displayRole,
            roleName: roleData?.roles?.name,
            secProfileName: secProfileData?.security_profiles?.name,
          });
        }
        return { profile, role, displayRole };
      } catch (err) {
        console.error("Error loading user profile:", err);
        return { profile: { id: user.id, full_name: null, username: null, profile_picture_url: null, phone_number: null }, role: "user", displayRole: null as string | null };
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Secondary query — check security profile for additional admin detection
  const { data: roleNameData } = useQuery({
    queryKey: ["user-role-name", user?.id],
    queryFn: async () => {
      if (!user) return null;
      try {
        // Check security profile for more accurate admin detection
        const { data: secProfile } = await supabase
          .from("user_security_profiles")
          .select("security_profiles(name)")
          .eq("user_id", user.id)
          .maybeSingle();

        const secProfileName = (secProfile as { security_profiles?: { name?: string } | null } | null)?.security_profiles?.name ?? null;
        if (import.meta.env.DEV) {
          console.log("Security profile lookup:", { userId: user.id, secProfileName });
        }
        return { secProfileName };
      } catch (err) {
        console.error("Error fetching security profile:", err);
        return { secProfileName: null };
      }
    },
    enabled: !!user,
    staleTime: 30 * 60 * 1000,
  });

  const profile = data?.profile ?? null;
  const role = data?.role ?? null;
  const displayRole = data?.displayRole ?? null;
  const secProfileName = roleNameData?.secProfileName ?? null;

  const displayName = profile?.full_name || profile?.username || user?.email?.split('@')[0] || "User";
  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  // Check admin status from multiple sources:
  // 1. Primary role from users.role_id (direct check for "admin")
  // 2. Security profile name as fallback
  const isAdmin = role === "admin" || isAdminProfileName(secProfileName);

  if (import.meta.env.DEV) {
    console.log("User profile state:", {
      userId: user?.id,
      role,
      displayRole,
      secProfileName,
      isAdmin,
      loading: isPending
    });
  }

  return {
    profile,
    role,
    roleName: displayRole,
    isAdmin,
    loading: isPending,
    initials,
    displayRole,
  };
}
