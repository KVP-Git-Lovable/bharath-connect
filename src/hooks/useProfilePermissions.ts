import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useMemo, useEffect } from "react";
import { ADMIN_MODULE_PATH_MAP } from "@/components/security/permissionModules";
import { useUserProfile } from "./useUserProfile";

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

  // Get current user's security profile
  const { data: userProfile } = useQuery({
    queryKey: ["current-user-security-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
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
        .eq("profile_id", userProfile!.profile_id);
      if (error) throw error;
      return (data || []) as ProfilePermission[];
    },
    refetchInterval: 5000, // Auto-refetch every 5 seconds for real-time updates
  });

  // Subscribe to permission changes and refetch when they change
  useEffect(() => {
    if (!userProfile?.profile_id) return;

    const subscription = supabase
      .channel(`profile_permissions_${userProfile.profile_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profile_object_permissions",
          filter: `profile_id=eq.${userProfile.profile_id}`,
        },
        () => {
          // Invalidate and refetch permissions when they change
          queryClient.invalidateQueries({ queryKey: ["user-profile-permissions", userProfile.profile_id] });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userProfile?.profile_id, queryClient]);

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
