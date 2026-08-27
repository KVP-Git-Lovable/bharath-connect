// This file provides backward compatibility for components that still reference
// static permission module names. The actual source of truth is now the
// permission_definitions table in the database.

export interface PermissionModule {
  id: string;
  name: string;
  label: string;
}

// Legacy static list — kept only for ADMIN_MODULE_PATH_MAP references.
// The dynamic system reads from the DB via usePermissionDefinitions hook.
export const PERMISSION_MODULES: PermissionModule[] = [];

// Admin sub-module path map (used by useProfilePermissions for route gating)
export const ADMIN_MODULE_PATH_MAP: Record<string, string> = {
  admin_dashboard: "/admin",
  admin_user_management: "/admin-user-management",
  admin_attendance_mgmt: "/attendance-management",
  admin_expense_mgmt: "/admin-expense-management",
  admin_gps_track_mgmt: "/gps-tracking",
  admin_security_access: "/admin/security",
  admin_company_profile: "/company-profile",
};

export function getAllModuleNames(): string[] {
  return PERMISSION_MODULES.map((m) => m.name);
}
