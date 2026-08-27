import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import HierarchicalPermissionEditor, { PermissionState } from "./HierarchicalPermissionEditor";
import { usePermissionDefinitions, PermissionDefinition } from "@/hooks/usePermissionDefinitions";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { useMemo } from "react";

interface SecurityProfile {
  id: string;
  profile_name: string;
  is_system: boolean;
}

function buildPermissionsFromDefinitions(definitions: PermissionDefinition[]): PermissionState {
  const state: PermissionState = {};
  for (const def of definitions) {
    state[def.name] = {
      canRead: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      permissionType: def.type,
      parentModule: def.parent_module,
    };
  }
  return state;
}

function buildAllEnabledFromDefinitions(definitions: PermissionDefinition[]): PermissionState {
  const state = buildPermissionsFromDefinitions(definitions);
  Object.keys(state).forEach((key) => {
    state[key] = { ...state[key], canRead: true, canCreate: true, canEdit: true, canDelete: true };
  });
  return state;
}

export default function RolePermissionsMatrix() {
  const queryClient = useQueryClient();
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [permissions, setPermissions] = useState<PermissionState>({});
  const [isDirty, setIsDirty] = useState(false);

  const { data: allDefinitions = [] } = usePermissionDefinitions();
  const { hasModuleAccess } = useProfilePermissions();

  // Whitelist of modules that mirror the app's navigation. Anything not listed
  // here (e.g. legacy `module_vendors`) is hidden from the permission matrix.
  // `module_sites` is intentionally omitted because Projects and Sites are a
  // single nav item — `module_projects` covers both and is relabeled below.
  const NAV_MODULES: Record<string, { label?: string; alwaysShow?: boolean }> = {
    module_admin_panel: {},
    module_attendance: {},
    module_activities: {},
    module_expenses: {},
    module_gps_tracking: { alwaysShow: true },
    module_procurement: {},
    module_projects: { label: "Projects / Sites", alwaysShow: true },
    module_master_data: { alwaysShow: true },
    module_reports: { alwaysShow: true },
    module_my_team: { alwaysShow: true },
    module_customers: {},
    module_opportunities: {},
    module_leads: { label: "Leads", alwaysShow: true },
    module_events: { label: "Events", alwaysShow: true },
  };

  const definitions = useMemo(() => {
    const allowedModules = new Set(
      allDefinitions
        .filter((d) => {
          if (d.type !== "module") return false;
          const cfg = NAV_MODULES[d.name];
          if (!cfg) return false;
          return cfg.alwaysShow || hasModuleAccess(d.name);
        })
        .map((d) => d.name)
    );
    // Re-parent orphaned children of hidden `module_sites` onto `module_projects`.
    return allDefinitions
      .filter((d) => {
        if (d.type === "module") return allowedModules.has(d.name);
        const parent = d.parent_module === "module_sites" ? "module_projects" : d.parent_module;
        return !parent || allowedModules.has(parent);
      })
      .map((d) => {
        const cfg = d.type === "module" ? NAV_MODULES[d.name] : undefined;
        const label = cfg?.label ?? d.label;
        const parent_module = d.parent_module === "module_sites" ? "module_projects" : d.parent_module;
        return { ...d, label, parent_module };
      });
  }, [allDefinitions, hasModuleAccess]);


  // Fetch all profiles
  const profilesQuery = useQuery({
    queryKey: ["security-profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_profiles")
        .select("id, name, is_system")
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data || []).map((d) => ({ id: d.id, profile_name: d.name, is_system: d.is_system })) as SecurityProfile[];
    },
  });

  // Auto-select System Administrator
  useEffect(() => {
    if (profilesQuery.data && !selectedProfileId) {
      const sysAdmin = profilesQuery.data.find((p) => p.profile_name === "System Administrator");
      if (sysAdmin) setSelectedProfileId(sysAdmin.id);
      else if (profilesQuery.data.length > 0) setSelectedProfileId(profilesQuery.data[0].id);
    }
  }, [profilesQuery.data, selectedProfileId]);

  const selectedProfile = profilesQuery.data?.find((p) => p.id === selectedProfileId);
  const isSystemAdmin = selectedProfile?.profile_name === "System Administrator";

  // Fetch permissions for selected profile
  const permsQuery = useQuery({
    queryKey: ["profile-permissions-hierarchical", selectedProfileId],
    enabled: !!selectedProfileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_object_permissions")
        .select("*")
        .eq("profile_id", selectedProfileId);
      if (error) throw error;
      return data || [];
    },
  });

  // Populate permissions state from DB + definitions
  useEffect(() => {
    if (definitions.length === 0) return;

    if (isSystemAdmin) {
      setPermissions(buildAllEnabledFromDefinitions(definitions));
      setIsDirty(false);
      return;
    }
    const base = buildPermissionsFromDefinitions(definitions);
    if (permsQuery.data) {
      for (const row of permsQuery.data) {
        if (base[row.object_name]) {
          base[row.object_name] = {
            ...base[row.object_name],
            canRead: row.can_read,
            canCreate: row.can_create,
            canEdit: row.can_edit,
            canDelete: row.can_delete,
          };
        }
      }
    }
    setPermissions(base);
    setIsDirty(false);
  }, [permsQuery.data, isSystemAdmin, selectedProfileId, definitions]);

  const handleChange = useCallback((updated: PermissionState) => {
    setPermissions(updated);
    setIsDirty(true);
  }, []);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProfileId) throw new Error("No profile selected");

      const { error: delError } = await supabase
        .from("profile_object_permissions")
        .delete()
        .eq("profile_id", selectedProfileId);
      if (delError) throw delError;

      const rows = Object.entries(permissions).map(([objectName, p]) => ({
        profile_id: selectedProfileId,
        object_name: objectName,
        permission_type: p.permissionType,
        parent_module: p.parentModule,
        can_read: p.canRead,
        can_create: p.canCreate,
        can_edit: p.canEdit,
        can_delete: p.canDelete,
        can_view_all: false,
        can_modify_all: false,
      }));

      const { error: insError } = await supabase
        .from("profile_object_permissions")
        .insert(rows);
      if (insError) throw insError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-permissions-hierarchical", selectedProfileId] });
      queryClient.invalidateQueries({ queryKey: ["user-profile-permissions"] });
      toast.success("Permissions saved successfully");
      setIsDirty(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 md:p-5">
          {/* Profile Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base md:text-lg font-semibold">Role Permissions</h2>
                <p className="text-[11px] md:text-xs text-muted-foreground">Configure module, field, action & widget permissions</p>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0 self-end sm:self-auto"
              disabled={!isDirty || isSystemAdmin || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving</>
              ) : (
                <><Save className="h-4 w-4 mr-1" />Save</>
              )}
            </Button>
          </div>

          <div className="mb-4 md:mb-5">
            <Select value={selectedProfileId} onValueChange={(v) => { setSelectedProfileId(v); setIsDirty(false); }}>
              <SelectTrigger className="w-full md:max-w-xs">
                <SelectValue placeholder="Select a security profile..." />
              </SelectTrigger>
              <SelectContent>
                {profilesQuery.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      {p.profile_name}
                      {p.is_system && <Badge variant="secondary" className="text-[10px] ml-1">System</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isSystemAdmin && (
            <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">System Administrator</span> has all permissions granted automatically and cannot be modified.
              </p>
            </div>
          )}

          {selectedProfileId ? (
            <HierarchicalPermissionEditor
              permissions={permissions}
              definitions={definitions}
              readOnly={isSystemAdmin}
              onChange={handleChange}
            />
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Select a security profile to configure permissions
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
