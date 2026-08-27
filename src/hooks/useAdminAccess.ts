import { useProfilePermissions } from "./useProfilePermissions";

export function useAdminAccess() {
  const {
    hasAnyAdminPermission,
    hasModuleAccess,
    permittedAdminPaths,
    isLoading,
  } = useProfilePermissions();

  return {
    hasAdminAccess: hasAnyAdminPermission,
    hasModuleAccess,
    permittedAdminPaths,
    isLoading,
  };
}
