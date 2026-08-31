import { useMemo, useState } from "react";
import { LeadAvatar } from "./LeadAvatar";
import { fieldDef, formatCell, rawValue, type KanbanConfig } from "@/lib/leadFields";

interface Option { value: string; label: string }

interface Props {
  rows: any[];
  config: KanbanConfig;
  /** Picklist options for the grouping field. */
  options: Option[];
  columns: string[];
  avatars?: Record<string, string>;
  onOpen: (row: any) => void;
  onMove: (row: any, field: string, value: string) => void;
}

const EMPTY = "__empty__";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

export default function LeadKanban({ rows, config, options, columns, avatars = {}, onOpen, onMove }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const groups = useMemo(() => {
    const base: { key: string; label: string }[] = options.map((o) => ({ key: o.value, label: o.label }));
    const present = new Set(rows.map((r) => String(rawValue(r, config.group_field) ?? "")));
    present.forEach((v) => {
      if (v && !base.some((b) => b.key === v)) base.push({ key: v, label: v });
    });
    base.push({ key: EMPTY, label: "— None —" });
    return base.map((g) => ({
      ...g,
      rows: rows.filter((r) => {
        const v = rawValue(r, config.group_field);
        const key = v === null || v === undefined || v === "" ? EMPTY : String(v);
        return key === g.key;
      }),
    }));
  }, [rows, options, config.group_field]);

  const summaryLabel = config.summarize_field ? fieldDef(config.summarize_field)?.label : null;

  const secondary = columns.filter((c) => c !== "name" && c !== config.group_field).slice(0, 3);

  return (
    <div className="overflow-x-auto p-4">
      <div className="flex gap-4 min-w-max items-start">
        {groups.map((g) => {
          const total = config.summarize_field
            ? g.rows.reduce((sum, r) => sum + (Number(rawValue(r, config.summarize_field!)) || 0), 0)
            : null;
          return (
            <div
              key={g.key}
              className={`w-72 shrink-0 rounded-xl border transition-colors ${
                overCol === g.key ? "border-primary bg-primary/5" : "border-border bg-muted/30"
              }`}
              onDragOver={(e) => { e.preventDefault(); setOverCol(g.key); }}
              onDragLeave={() => setOverCol((c) => (c === g.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                const row = rows.find((r) => r.id === dragId);
                setDragId(null);
                if (!row) return;
                const current = rawValue(row, config.group_field);
                const next = g.key === EMPTY ? "" : g.key;
                if (String(current ?? "") === next) return;
                onMove(row, config.group_field, next);
              }}
            >
              <div className="sticky top-0 rounded-t-xl bg-primary px-3 py-2 text-primary-foreground">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{g.label}</span>
                  <span className="text-xs opacity-90">({g.rows.length})</span>
                </div>
                {total !== null && (
                  <p className="mt-0.5 text-[11px] opacity-90">
                    {summaryLabel}: {inr(total)}
                  </p>
                )}
              </div>

              <div className="space-y-2 p-2 min-h-[120px]">
                {g.rows.map((row) => (
                  <div
                    key={row.id}
                    draggable
                    onDragStart={() => setDragId(row.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onClick={() => onOpen(row)}
                    className={`cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:shadow-md ${
                      dragId === row.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <LeadAvatar
                        name={row.name}
                        photoUrl={avatars[row.id]}
                        className="h-8 w-8"
                      />
                      <p className="truncate text-sm font-medium text-primary">{formatCell(row, "name")}</p>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {secondary.map((key) => (
                        <p key={key} className="truncate text-xs text-muted-foreground">
                          {fieldDef(key)?.label}: {formatCell(row, key)}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
                {g.rows.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">Drop a card here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
