// Legacy compatibility file — the dynamic system reads from the DB
// via usePermissionDefinitions hook. These are kept for any remaining
// static references in the codebase.

export interface HierarchicalItem {
  name: string;
  label: string;
}

export interface HierarchicalModule {
  module: string;
  label: string;
  fields: HierarchicalItem[];
  actions: HierarchicalItem[];
  widgets: HierarchicalItem[];
}

// Empty — all definitions are now in the permission_definitions DB table
export const HIERARCHICAL_MODULES: HierarchicalModule[] = [];

export function getModuleByName(moduleName: string): HierarchicalModule | undefined {
  return HIERARCHICAL_MODULES.find((m) => m.module === moduleName);
}

export function getAllFieldNames(): string[] {
  return HIERARCHICAL_MODULES.flatMap((m) => m.fields.map((f) => f.name));
}

export function getAllActionNames(): string[] {
  return HIERARCHICAL_MODULES.flatMap((m) => m.actions.map((a) => a.name));
}

export function getAllWidgetNames(): string[] {
  return HIERARCHICAL_MODULES.flatMap((m) => m.widgets.map((w) => w.name));
}

export function getPermissionType(itemName: string): "module" | "field" | "action" | "widget" {
  if (itemName.startsWith("module_")) return "module";
  if (itemName.startsWith("field_")) return "field";
  if (itemName.startsWith("action_")) return "action";
  if (itemName.startsWith("widget_")) return "widget";
  return "module";
}

export function getParentModule(itemName: string): string | null {
  for (const mod of HIERARCHICAL_MODULES) {
    if (mod.fields.some((f) => f.name === itemName)) return mod.module;
    if (mod.actions.some((a) => a.name === itemName)) return mod.module;
    if (mod.widgets.some((w) => w.name === itemName)) return mod.module;
  }
  return null;
}

export function getItemLabel(itemName: string): string {
  for (const mod of HIERARCHICAL_MODULES) {
    if (mod.module === itemName) return mod.label;
    const field = mod.fields.find((f) => f.name === itemName);
    if (field) return field.label;
    const action = mod.actions.find((a) => a.name === itemName);
    if (action) return action.label;
    const widget = mod.widgets.find((w) => w.name === itemName);
    if (widget) return widget.label;
  }
  return itemName;
}
