import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useMemo, useEffect, useRef } from "react";
import { ADMIN_MODULE_PATH_MAP } from "@/components/security/permissionModules";
import { useUserProfile } from "./useUserProfile";
import { useCurrentUser } from "./useCurrentUser";

/**
 * One realtime channel per profile, shared by every mounted consumer.
 *
 * This hook has 13 call sites and several of them render together (AppHeader,
 * BottomNav, Dashboard, WorkforceOverviewSection, useAdminAccess), so a
 * per-instance subscription breaks: supabase.channel(topic) hands back the
 * channel an earlier instance already subscribed, and RealtimeChannel.on()
 * throws once that channel is joining or joined. Subscribing once and
 * fanning out to listeners keeps .on() to a single call on a fresh channel,
 * however many consumers mount.
 */
type PermissionListener = () => void;

const permissionChannels = new Map<
  string,
  { channel: ReturnType<typeof supabase.channel>; listeners: Set<PermissionListener> }
>();

export function subscribeToProfilePermissions(profileId: string, listener: PermissionListener): () => void {
  let entry = permissionChannels.get(profileId);

  if (!entry) {
    const topic = `profile_permissions_${profileId}`;
    // A channel we are not tracking is stale (module reload); drop it so the
    // fresh .on() below runs on an unsubscribed channel.
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (stale) supabase.removeChannel(stale);

    const listeners = new Set<PermissionListener>();
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profile_object_permissions",
          filter: `profile_id=eq.${profileId}`,
        },
        () => listeners.forEach((l) => l()),
      )
      .subscribe();

    entry = { channel, listeners };
    permissionChannels.set(profileId, entry);
  }

  entry.listeners.add(listener);

  return () => {
    const current = permissionChannels.get(profileId);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      permissionChannels.delete(profileId);
      supabase.removeChannel(current.channel);
    }
  };
}


interface ProfilePermission {
  object_name: string;
  permission_type: string;
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_view_all: boolean;
  can_modify_all: boolean;
}

export function useProfilePermissions() {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserProfile();
  const { user } = useCurrentUser();

  // Get current user's security profile.
  // The key MUST include the user id, otherwise a previously signed-in user's
  // security profile stays cached and drives this user's navigation.
  const { data: userProfile } = useQuery({
    queryKey: ["current-user-security-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("user_security_profiles")
        .select("profile_id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });


  const { data: permissions } = useQuery({
    queryKey: ["user-profile-permissions", userProfile?.profile_id],
    enabled: !!userProfile?.profile_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_object_permissions")
        .select("object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all")
        .eq("profile_id", userProfile!.profile_id!);
      if (error) throw error;
      return (data || []) as ProfilePermission[];
    },
    // Permission changes already arrive through the realtime subscription
    // below, which invalidates this query the moment a row changes. This poll
    // is the fallback for a dropped socket, so it does not need to be frequent:
    // at 5s it was a round trip every five seconds, for every session, all day.
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
  });

  // Kept in a ref so the effect below depends only on the profile id. The
  // QueryClient is built inside getRouter() rather than at module scope, so a
  // fresh identity would otherwise tear the subscription down and rebuild it.
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  // Subscribe to permission changes and refetch when they change
  useEffect(() => {
    const profileId = userProfile?.profile_id;
    if (!profileId) return;

    return subscribeToProfilePermissions(profileId, () => {
      queryClientRef.current.invalidateQueries({ queryKey: ["user-profile-permissions", profileId] });
    });
  }, [userProfile?.profile_id]);

  const hasNoProfile = userProfile === null;

  const hasPermission = useCallback(
    (objectName: string, perm: "read" | "create" | "edit" | "delete" | "view_all" | "modify_all" = "read") => {
      // No profile assigned = legacy full access
      if (hasNoProfile) return true;
      if (!permissions) return false;
      const found = permissions.find((p) => p.object_name === objectName);
      if (!found) return false;
      const key = `can_${perm}` as keyof ProfilePermission;
      return !!found[key];
    },
    [permissions, hasNoProfile]
  );

  const hasModuleAccess = useCallback(
    (moduleName: string) => {
      // No profile = legacy full access; otherwise check permissions
      if (hasNoProfile) return true;
      // For admins with a profile, check if they have the permission
      // (they should have permissions for all SBEE modules in their profile)
      return hasPermission(moduleName, "read");
    },
    [hasPermission, hasNoProfile]
  );

  const hasFieldPermission = useCallback(
    (fieldName: string, perm: "read" | "create" | "edit" | "delete" = "read") =>
      hasPermission(fieldName, perm),
    [hasPermission]
  );

  const hasActionPermission = useCallback(
    (actionName: string, perm: "read" | "create" | "edit" | "delete" = "read") =>
      hasPermission(actionName, perm),
    [hasPermission]
  );

  const hasWidgetPermission = useCallback(
    (widgetName: string) => hasPermission(widgetName, "read"),
    [hasPermission]
  );

  const hasAnyAdminPermission = useMemo(() => {
    if (hasNoProfile) return true;
    if (!permissions) return false;
    return permissions.some(
      (p) => p.object_name === "module_admin_panel" && p.can_read
    );
  }, [permissions, hasNoProfile]);

  const permittedAdminPaths = useMemo(() => {
    if (hasNoProfile) return Object.values(ADMIN_MODULE_PATH_MAP);
    if (!permissions) return [];
    const paths: string[] = [];
    for (const [key, path] of Object.entries(ADMIN_MODULE_PATH_MAP)) {
      const fieldName = `field_${key}`;
      const found = permissions.find((p) => p.object_name === fieldName);
      if (found?.can_read) paths.push(path);
    }
    // If they have module_admin_panel access, give all paths
    if (hasModuleAccess("module_admin_panel")) return Object.values(ADMIN_MODULE_PATH_MAP);
    return paths;
  }, [permissions, hasNoProfile, hasModuleAccess]);

  return {
    hasPermission,
    hasModuleAccess,
    hasFieldPermission,
    hasActionPermission,
    hasWidgetPermission,
    hasAnyAdminPermission,
    permittedAdminPaths,
    isLoading: !permissions && !hasNoProfile,
  };
}
