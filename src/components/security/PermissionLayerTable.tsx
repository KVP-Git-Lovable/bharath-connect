import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PermissionRow {
  objectName: string;
  label: string;
  parentModule?: string;
  canRead: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface Props {
  rows: PermissionRow[];
  grouped?: boolean;
  groupLabels?: Record<string, string>;
  readOnly?: boolean;
  onToggle: (objectName: string, field: "canRead" | "canCreate" | "canEdit" | "canDelete", value: boolean) => void;
  onToggleAll: (objectName: string, value: boolean) => void;
  onToggleGroupAll?: (parentModule: string, value: boolean) => void;
}

const FIELDS = ["canRead", "canCreate", "canEdit", "canDelete"] as const;
const FIELD_LABELS: Record<string, string> = {
  canRead: "View",
  canCreate: "Create",
  canEdit: "Edit",
  canDelete: "Delete",
};

export default function PermissionLayerTable({
  rows,
  grouped = false,
  groupLabels = {},
  readOnly = false,
  onToggle,
  onToggleAll,
  onToggleGroupAll,
}: Props) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Group rows by parentModule
  const groups: Record<string, PermissionRow[]> = {};
  if (grouped) {
    for (const row of rows) {
      const key = row.parentModule || "ungrouped";
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
  }

  const renderRow = (row: PermissionRow) => {
    const allEnabled = FIELDS.every((f) => row[f]);
    return (
      <TableRow key={row.objectName}>
        <TableCell className="font-medium text-xs md:text-sm py-2.5 pl-3 md:pl-5">{row.label}</TableCell>
        {FIELDS.map((field) => (
          <TableCell key={field} className="text-center py-2.5">
            <div className="flex justify-center">
              <Checkbox
                checked={row[field]}
                disabled={readOnly}
                onCheckedChange={(v) => onToggle(row.objectName, field, !!v)}
              />
            </div>
          </TableCell>
        ))}
        <TableCell className="text-center py-2.5 pr-3 md:pr-5">
          <div className="flex justify-center">
            <Checkbox
              checked={allEnabled}
              disabled={readOnly}
              onCheckedChange={(v) => onToggleAll(row.objectName, !!v)}
            />
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="overflow-x-auto -mx-3 md:mx-0 scrollbar-thin">
      <Table className="min-w-[480px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs font-medium text-muted-foreground pl-3 md:pl-5 min-w-[140px] md:min-w-[200px]">Name</TableHead>
            {FIELDS.map((f) => (
              <TableHead key={f} className="text-xs font-medium text-muted-foreground text-center w-[60px] md:w-[80px]">
                {FIELD_LABELS[f]}
              </TableHead>
            ))}
            <TableHead className="text-xs font-medium text-muted-foreground text-center w-[50px] md:w-[70px] pr-3 md:pr-5">All</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!grouped
            ? rows.map(renderRow)
            : Object.entries(groups).map(([groupKey, groupRows]) => {
                const isCollapsed = collapsedGroups.has(groupKey);
                const groupAllEnabled = groupRows.every((r) => FIELDS.every((f) => r[f]));
                return (
                  <React.Fragment key={groupKey}>
                    <TableRow
                      className="bg-muted/50 cursor-pointer hover:bg-muted/70"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <TableCell className="font-semibold text-xs md:text-sm py-2 pl-3" colSpan={1}>
                        <div className="flex items-center gap-1.5">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          {groupLabels[groupKey] || groupKey}
                        </div>
                      </TableCell>
                      {FIELDS.map((f) => (
                        <TableCell key={f} className="text-center py-2">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={groupRows.every((r) => r[f])}
                              disabled={readOnly}
                              onCheckedChange={(v) => {
                                groupRows.forEach((r) => onToggle(r.objectName, f, !!v));
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </TableCell>
                      ))}
                      <TableCell className="text-center py-2 pr-3 md:pr-5">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={groupAllEnabled}
                            disabled={readOnly}
                            onCheckedChange={(v) => {
                              if (onToggleGroupAll) onToggleGroupAll(groupKey, !!v);
                              else groupRows.forEach((r) => onToggleAll(r.objectName, !!v));
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                    {!isCollapsed && groupRows.map((row) => (
                      <TableRow key={row.objectName}>
                        <TableCell className={cn("font-medium text-xs md:text-sm py-2.5 pl-6 md:pl-8")}>{row.label}</TableCell>
                        {FIELDS.map((field) => (
                          <TableCell key={field} className="text-center py-2.5">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={row[field]}
                                disabled={readOnly}
                                onCheckedChange={(v) => onToggle(row.objectName, field, !!v)}
                              />
                            </div>
                          </TableCell>
                        ))}
                        <TableCell className="text-center py-2.5 pr-3 md:pr-5">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={FIELDS.every((f) => row[f])}
                              disabled={readOnly}
                              onCheckedChange={(v) => onToggleAll(row.objectName, !!v)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}
        </TableBody>
      </Table>
    </div>
  );
}
