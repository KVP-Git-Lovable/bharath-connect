import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PermissionDefinition {
  id: string;
  name: string;
  label: string;
  type: "module" | "field" | "action" | "widget";
  parent_module: string | null;
  sort_order: number;
  is_active: boolean;
}

export function usePermissionDefinitions() {
  return useQuery({
    queryKey: ["permission-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permission_definitions")
        .select("id, name, label, type, parent_module, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as PermissionDefinition[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function getModules(defs: PermissionDefinition[]) {
  return defs.filter((d) => d.type === "module");
}

export function getFieldsForModule(defs: PermissionDefinition[], moduleName: string) {
  return defs.filter((d) => d.type === "field" && d.parent_module === moduleName);
}

export function getActionsForModule(defs: PermissionDefinition[], moduleName: string) {
  return defs.filter((d) => d.type === "action" && d.parent_module === moduleName);
}

export function getWidgetsForModule(defs: PermissionDefinition[], moduleName: string) {
  return defs.filter((d) => d.type === "widget" && d.parent_module === moduleName);
}

export function getByType(defs: PermissionDefinition[], type: "module" | "field" | "action" | "widget") {
  return defs.filter((d) => d.type === type);
}

export function getModuleLabel(defs: PermissionDefinition[], moduleName: string): string {
  return defs.find((d) => d.name === moduleName)?.label || moduleName;
}
