import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  OPERATORS,
  LEAD_FIELDS,
  fieldDef,
  type FilterCondition,
  type ListView,
} from "@/lib/leadFields";

interface PickOption { value: string; label: string }

interface Props {
  view: ListView | null;
  canManage: boolean;
  picklistOptions: Record<string, PickOption[]>;
  onSave: (filters: { match: "all" | "any"; conditions: FilterCondition[] }) => void;
  onClose: () => void;
}

const blank = (): FilterCondition => ({ field: "status_name", operator: "equals", value: "", values: [] });

const labelFor = (key: string) => LEAD_FIELDS.find((f) => f.key === key)?.label ?? key;

function operatorLabel(field: string, op: string) {
  const type = fieldDef(field)?.type ?? "text";
  return OPERATORS[type].find((o) => o.value === op)?.label ?? op;
}

function conditionText(c: FilterCondition) {
  const val = c.values?.length ? c.values.join(", ") : [c.value, c.value2].filter(Boolean).join(" – ");
  return `${operatorLabel(c.field, c.operator)}${val ? ` ${val}` : ""}`;
}

export default function ViewFiltersPanel({ view, canManage, picklistOptions, onSave, onClose }: Props) {
  const locked = !canManage;
  const [editing, setEditing] = useState(false);
  const [match, setMatch] = useState<"all" | "any">(view?.filters?.match ?? "all");
  const [conditions, setConditions] = useState<FilterCondition[]>(view?.filters?.conditions ?? []);

  useEffect(() => {
    setMatch(view?.filters?.match ?? "all");
    setConditions(view?.filters?.conditions ?? []);
    setEditing(false);
  }, [view?.id, view?.filters]);

  const optionsFor = (source?: string): PickOption[] => picklistOptions[source ?? ""] ?? [];

  const updateCond = (i: number, patch: Partial<FilterCondition>) =>
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const startEdit = () => setEditing(true);

  const save = () => {
    onSave({ match, conditions: conditions.filter((c) => c.field && c.operator) });
    setEditing(false);
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold">Filters</h2>
        <div className="flex items-center gap-1">
          {!locked && !editing && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEdit} aria-label="Edit filters">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close filters">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium text-primary">Scope</p>
          <p className="text-sm text-muted-foreground">All leads you can access</p>
        </div>

        {locked ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Only the view owner can change filters.
          </p>

        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Matching {match === "all" ? "all" : "any"} of these filters
            </p>
            {editing && (
              <Select value={match} onValueChange={(v) => setMatch(v as "all" | "any")}>
                <SelectTrigger className="h-8 w-[104px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="all">Match ALL</SelectItem>
                  <SelectItem value="any">Match ANY</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {conditions.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            No filters — this view shows all leads.
          </p>
        )}

        {!editing
          ? conditions.map((c, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-3">
                <p className="text-sm font-medium">{labelFor(c.field)}</p>
                <p className="text-sm text-muted-foreground">{conditionText(c)}</p>
              </div>
            ))
          : conditions.map((c, i) => {
              const def = fieldDef(c.field);
              const ops = OPERATORS[def?.type ?? "text"];
              const picks = optionsFor(def?.optionsSource);
              const dateNeedsInput = ["on", "before", "after", "between", "last_n_days", "next_n_days"].includes(c.operator);
              const needsValue =
                !["is_empty", "is_not_empty"].includes(c.operator) &&
                (def?.type !== "date" || dateNeedsInput);
              return (
                <div key={i} className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Filter {i + 1}</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setConditions((p) => p.filter((_, idx) => idx !== i))}
                      aria-label="Remove filter"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <Select
                    value={c.field}
                    onValueChange={(v) => {
                      const nd = fieldDef(v);
                      updateCond(i, {
                        field: v,
                        operator: OPERATORS[nd?.type ?? "text"][0].value,
                        value: "",
                        value2: "",
                        values: [],
                      });
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-50 max-h-72 bg-popover">
                      {LEAD_FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={c.operator} onValueChange={(v) => updateCond(i, { operator: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-50 max-h-72 bg-popover">
                      {ops.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                    </SelectContent>
                  </Select>

                  {needsValue && (
                    <div className="flex items-center gap-2">
                      {def?.type === "picklist" && picks.length && c.operator !== "in" ? (
                        <Select value={c.value} onValueChange={(v) => updateCond(i, { value: v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent className="z-50 max-h-72 bg-popover">
                            {picks.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      ) : def?.type === "date" && !["last_n_days", "next_n_days"].includes(c.operator) ? (
                        <>
                          <Input type="date" className="h-9 text-sm" value={c.value} onChange={(e) => updateCond(i, { value: e.target.value })} />
                          {c.operator === "between" && (
                            <Input type="date" className="h-9 text-sm" value={c.value2 ?? ""} onChange={(e) => updateCond(i, { value2: e.target.value })} />
                          )}
                        </>
                      ) : (
                        <>
                          <Input
                            type={def?.type === "number" ? "number" : "text"}
                            className="h-9 text-sm"
                            value={c.value}
                            placeholder={c.operator === "in" || c.operator === "in_list" ? "Value 1, Value 2" : "Value"}
                            onChange={(e) =>
                              updateCond(i, {
                                value: e.target.value,
                                values: c.operator === "in"
                                  ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                                  : [],
                              })
                            }
                          />
                          {c.operator === "between" && (
                            <Input type="number" className="h-9 text-sm" value={c.value2 ?? ""} placeholder="and" onChange={(e) => updateCond(i, { value2: e.target.value })} />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

        {!locked && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => { setEditing(true); setConditions((p) => [...p, blank()]); }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Filter
          </Button>
        )}
      </div>

      {!locked && editing && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMatch(view?.filters?.match ?? "all");
              setConditions(view?.filters?.conditions ?? []);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={save}>Save</Button>
        </div>
      )}
    </div>
  );
}
