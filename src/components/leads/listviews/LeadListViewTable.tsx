import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react";
import { useStackedTable } from "@/hooks/useStackedTable";
import { fieldDef, formatCell, LEAD_FIELDS, rawValue } from "@/lib/leadFields";
import { LeadAvatar } from "./LeadAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortDir = "asc" | "desc";

interface Props {
  rows: any[];
  columns: string[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (row: any) => void;
  avatars?: Record<string, string>;
  sortKey?: string | null;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  /** Enables inline editing of the cell values. */
  onInlineSave?: (row: any, key: string, value: any) => Promise<void> | void;
  picklistOptions?: Record<string, { value: string; label: string }[]>;
}

const labelFor = (key: string) => LEAD_FIELDS.find((f) => f.key === key)?.label ?? key;

/** Columns that are computed / read-only and cannot be edited inline. */
const READ_ONLY = new Set([
  "created_at",
  "updated_at",
  "owner_name",
  "created_by_name",
  "activity_count",
  "productive_count",
  "days_since_last_activity",
  "total_effort_hours",
  "last_activity_date",
  "next_activity_date",
  "converted_label",
]);

export default function LeadListViewTable({
  rows, columns, selectedIds, onToggle, onToggleAll, onOpen, avatars = {},
  sortKey = null, sortDir = "asc", onSort, onInlineSave, picklistOptions = {},
}: Props) {
  const tableRef = useStackedTable<HTMLTableElement>();
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [draft, setDraft] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const cell = (row: any, key: string) => formatCell(row, key);

  const canEdit = (key: string) => !!onInlineSave && !READ_ONLY.has(key);

  const startEdit = (row: any, key: string) => {
    if (!canEdit(key)) return;
    const v = rawValue(row, key);
    setDraft(v == null ? "" : String(v));
    setEditing({ id: row.id, key });
  };

  const commit = async (row: any, key: string, value: string) => {
    setEditing(null);
    const original = rawValue(row, key);
    const next = value === "" ? null : value;
    if (String(original ?? "") === String(next ?? "")) return;
    await onInlineSave?.(row, key, next);
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const renderEditor = (row: any, key: string) => {
    const def = fieldDef(key);
    const options = picklistOptions[def?.optionsSource ?? ""] ?? [];

    if (def?.type === "picklist" && options.length > 0) {
      return (
        <Select
          defaultValue={draft || undefined}
          onValueChange={(v) => commit(row, key, v)}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        ref={inputRef}
        className="h-8 text-sm"
        type={def?.type === "date" ? "date" : def?.type === "number" ? "number" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(row, key, draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(row, key, draft);
          if (e.key === "Escape") setEditing(null);
        }}
      />
    );
  };

  return (
    <div className="overflow-x-auto table-scroll">
      <table ref={tableRef} className="w-full responsive-table">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-4 w-10">
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all" />
            </th>
            {columns.map((key) => (
              <th key={key} className="text-left text-xs font-medium text-muted-foreground p-4 whitespace-nowrap">
                {onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    title="Sort ascending / descending / clear"
                  >
                    {labelFor(key)}
                    <SortIcon column={key} />
                  </button>
                ) : (
                  labelFor(key)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpen(row)}>
              <td className="p-4" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selectedIds.has(row.id)} onCheckedChange={() => onToggle(row.id)} aria-label="Select row" />
              </td>
              {columns.map((key) => {
                const def = fieldDef(key);
                const value = cell(row, key);
                const isEditing = editing?.id === row.id && editing.key === key;

                if (isEditing) {
                  return (
                    <td key={key} className="p-2" data-label={labelFor(key)} onClick={(e) => e.stopPropagation()}>
                      {renderEditor(row, key)}
                    </td>
                  );
                }

                const editAffordance = canEdit(key) && (
                  <button
                    type="button"
                    aria-label={`Edit ${labelFor(key)}`}
                    className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                    onClick={(e) => { e.stopPropagation(); startEdit(row, key); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                );

                if (key === "status_name") {
                  return (
                    <td key={key} className="p-4 group/cell" data-label={labelFor(key)}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            row.status_name ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {row.status_name || "—"}
                        </span>
                        {editAffordance}
                      </span>
                    </td>
                  );
                }

                if (key === "name") {
                  return (
                    <td key={key} className="p-4 text-sm font-medium" data-label={labelFor(key)}>
                      <div className="flex items-center gap-3">
                        <LeadAvatar
                        name={row.name}
                          photoUrl={avatars[row.id]}
                          className="h-9 w-9"
                        />
                        <span className="line-clamp-2">{value}</span>
                      </div>
                    </td>
                  );
                }

                return (
                  <td
                    key={key}
                    data-label={labelFor(key)}
                    className={`p-4 text-sm group/cell ${def?.type === "number" ? "tabular-nums" : ""} text-muted-foreground`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="line-clamp-2">{value}</span>
                      {editAffordance}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
