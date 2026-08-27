import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PermissionLayerTable, { PermissionRow } from "./PermissionLayerTable";
import { PermissionDefinition, getModules, getByType } from "@/hooks/usePermissionDefinitions";

export interface PermissionState {
  [objectName: string]: {
    canRead: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    permissionType: string;
    parentModule: string | null;
  };
}

interface Props {
  permissions: PermissionState;
  definitions: PermissionDefinition[];
  readOnly?: boolean;
  onChange: (updated: PermissionState) => void;
}

type CrudField = "canRead" | "canCreate" | "canEdit" | "canDelete";

export default function HierarchicalPermissionEditor({ permissions, definitions, readOnly = false, onChange }: Props) {
  const toggleField = (objectName: string, field: CrudField, value: boolean) => {
    const updated = { ...permissions };
    if (updated[objectName]) {
      updated[objectName] = { ...updated[objectName], [field]: value };
    }
    onChange(updated);
  };

  const toggleAll = (objectName: string, value: boolean) => {
    const updated = { ...permissions };
    if (updated[objectName]) {
      updated[objectName] = {
        ...updated[objectName],
        canRead: value,
        canCreate: value,
        canEdit: value,
        canDelete: value,
      };
    }
    onChange(updated);
  };

  const cascadeModuleToggle = (objectName: string, field: CrudField, value: boolean) => {
    const updated = { ...permissions };
    if (updated[objectName]) {
      updated[objectName] = { ...updated[objectName], [field]: value };
    }
    Object.keys(updated).forEach((key) => {
      if (updated[key].parentModule === objectName) {
        updated[key] = { ...updated[key], [field]: value };
      }
    });
    onChange(updated);
  };

  const cascadeModuleToggleAll = (objectName: string, value: boolean) => {
    const updated = { ...permissions };
    const setAll = (key: string) => {
      updated[key] = {
        ...updated[key],
        canRead: value,
        canCreate: value,
        canEdit: value,
        canDelete: value,
      };
    };
    if (updated[objectName]) setAll(objectName);
    Object.keys(updated).forEach((key) => {
      if (updated[key].parentModule === objectName) setAll(key);
    });
    onChange(updated);
  };

  // Build rows dynamically from definitions
  const modules = getModules(definitions);

  const moduleRows: PermissionRow[] = modules.map((m) => {
    const p = permissions[m.name];
    return {
      objectName: m.name,
      label: m.label,
      canRead: p?.canRead ?? false,
      canCreate: p?.canCreate ?? false,
      canEdit: p?.canEdit ?? false,
      canDelete: p?.canDelete ?? false,
    };
  });

  // Build a map of module name -> sort_order for ordering groups
  const moduleSortOrder: Record<string, number> = {};
  modules.forEach((m) => {
    moduleSortOrder[m.name] = m.sort_order;
  });

  const buildLayerRows = (type: "field" | "action" | "widget"): PermissionRow[] => {
    const items = getByType(definitions, type);
    // Sort by parent module's sort_order first, then by item's own sort_order
    const sorted = [...items].sort((a, b) => {
      const parentA = moduleSortOrder[a.parent_module || ""] ?? 999;
      const parentB = moduleSortOrder[b.parent_module || ""] ?? 999;
      if (parentA !== parentB) return parentA - parentB;
      return a.sort_order - b.sort_order;
    });
    return sorted.map((item) => {
      const p = permissions[item.name];
      return {
        objectName: item.name,
        label: item.label,
        parentModule: item.parent_module || undefined,
        canRead: p?.canRead ?? false,
        canCreate: p?.canCreate ?? false,
        canEdit: p?.canEdit ?? false,
        canDelete: p?.canDelete ?? false,
      };
    });
  };

  const groupLabels: Record<string, string> = {};
  modules.forEach((m) => {
    groupLabels[m.name] = m.label;
  });

  return (
    <Tabs defaultValue="modules" className="w-full">
      <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-0 overflow-x-auto">
        {["modules", "fields", "actions", "widgets"].map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 md:px-4 py-2 text-xs md:text-sm capitalize text-muted-foreground data-[state=active]:text-foreground whitespace-nowrap"
          >
            <span className="hidden md:inline">{tab === "modules" ? "Module Permission" : `${tab.charAt(0).toUpperCase() + tab.slice(1).replace(/s$/, "")} Permission`}</span>
            <span className="md:hidden">{tab === "modules" ? "Module" : tab.charAt(0).toUpperCase() + tab.slice(1).replace(/s$/, "")}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="modules" className="mt-4">
        <PermissionLayerTable
          rows={moduleRows}
          readOnly={readOnly}
          onToggle={(name, field, value) => cascadeModuleToggle(name, field, value)}
          onToggleAll={(name, value) => cascadeModuleToggleAll(name, value)}
        />
      </TabsContent>

      <TabsContent value="fields" className="mt-4">
        <PermissionLayerTable
          rows={buildLayerRows("field")}
          grouped
          groupLabels={groupLabels}
          readOnly={readOnly}
          onToggle={toggleField}
          onToggleAll={toggleAll}
        />
      </TabsContent>

      <TabsContent value="actions" className="mt-4">
        <PermissionLayerTable
          rows={buildLayerRows("action")}
          grouped
          groupLabels={groupLabels}
          readOnly={readOnly}
          onToggle={toggleField}
          onToggleAll={toggleAll}
        />
      </TabsContent>

      <TabsContent value="widgets" className="mt-4">
        <PermissionLayerTable
          rows={buildLayerRows("widget")}
          grouped
          groupLabels={groupLabels}
          readOnly={readOnly}
          onToggle={toggleField}
          onToggleAll={toggleAll}
        />
      </TabsContent>
    </Tabs>
  );
}
