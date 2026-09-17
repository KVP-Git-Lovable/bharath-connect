import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Car, ChevronDown, Loader2, Pencil, Plus, Save, Trash2, User, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import MultiProfileSelector from "./MultiProfileSelector";
import { MoneyInput } from "./VehicleTaCard";
import type { OverrideEntry } from "./OverrideTable";

type Method = "fixed" | "from_gps";
type Dist = "same_for_all" | "custom";

interface Role { id: string; name: string }
interface TaRow {
  id: string; name: string; fixed_ta_amount: number; ta_per_km_rate: number;
  role_ids: string[]; members: { id: string; name: string }[]; is_active: boolean;
}

interface Props {
  method: Method;
  onMethodChange: (m: Method) => void;
  defaultRate: number;
  defaultFixed: number;
  onDefaultRateChange: (n: number) => void;
  onDefaultFixedChange: (n: number) => void;
  defaultEnabled: boolean;
  onDefaultEnabledChange: (v: boolean) => void;
  dist: Dist;
  onDistChange: (d: Dist) => void;
  overrides: OverrideEntry[];
  onAddOverride: (type: "user" | "team", refId: string, name: string) => Promise<void> | void;
  onUpdateOverride: (id: string, amount: number) => Promise<void> | void;
  onDeleteOverride: (entry: OverrideEntry) => Promise<void> | void;
  onSave: () => Promise<void>;
  saving: boolean;
}

const hasTaAmount = (g: any) => Number(g.fixed_ta_amount || 0) > 0 || Number(g.ta_per_km_rate || 0) > 0;

export default function TaPolicyCard(props: Props) {
  const { method, dist, overrides } = props;
  const isFixed = method === "fixed";
  const [roles, setRoles] = useState<Role[]>([]);
  const [rows, setRows] = useState<TaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ name: string; rate: string; fixed: string; role_ids: string[] } | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmSame, setConfirmSame] = useState(false);
  const [editing, setEditing] = useState<TaRow | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<TaRow | null>(null);

  const load = useCallback(async () => {
    const [rolesRes, grpRes, memRes] = await Promise.all([
      supabase.from("security_profiles" as any).select("id, name").order("name"),
      supabase.from("expense_groups" as any).select("*").order("created_at"),
      supabase.from("expense_group_members" as any).select("group_id, user_id"),
    ]);
    setRoles(((rolesRes.data || []) as any[]).map((r) => ({ id: r.id, name: r.name })));
    const groups = ((grpRes.data || []) as any[]).filter(hasTaAmount);
    const mem = (memRes.data || []) as any[];
    const userIds = Array.from(new Set(mem.filter((m) => groups.some((g) => g.id === m.group_id)).map((m) => m.user_id)));
    let names = new Map<string, string>();
    if (userIds.length) {
      const { data } = await supabase.from("users").select("id, full_name").in("id", userIds);
      names = new Map(((data || []) as any[]).map((u) => [u.id, u.full_name || "Unnamed"]));
    }
    setRows(groups.map((g) => ({
      id: g.id, name: g.name,
      fixed_ta_amount: Number(g.fixed_ta_amount || 0), ta_per_km_rate: Number(g.ta_per_km_rate || 0),
      role_ids: Array.isArray(g.role_ids) ? g.role_ids : [],
      is_active: g.is_active !== false,
      members: mem.filter((m) => m.group_id === g.id).map((m) => ({ id: m.user_id, name: names.get(m.user_id) || "Unknown" })),
    })));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const customCount = rows.length + overrides.length;

  // Rows that exist mean the policy is custom, even if the saved flag says otherwise.
  useEffect(() => {
    if (!loading && rows.length > 0 && dist === "same_for_all") props.onDistChange("custom");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows.length]);

  const changeDist = (d: Dist) => {
    if (d === "same_for_all" && customCount > 0) { setConfirmSame(true); return; }
    props.onDistChange(d);
  };

  const clearCustom = async () => {
    try {
      if (rows.length) {
        const { error } = await supabase.from("expense_groups" as any).delete().in("id", rows.map((r) => r.id));
        if (error) throw error;
      }
      for (const o of overrides) await props.onDeleteOverride(o);
      toast.success("Custom rows removed — everyone now gets the default");
      props.onDistChange("same_for_all");
      setDraft(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove custom rows");
    } finally { setConfirmSame(false); }
  };

  const updateRow = async (row: TaRow, patch: Partial<Pick<TaRow, "name" | "fixed_ta_amount" | "ta_per_km_rate" | "role_ids">>) => {
    const next = { ...row, ...patch };
    if (!hasTaAmount(next)) { toast.error("A row needs a rate or a fixed price above ₹0"); load(); return; }
    const { error } = await supabase.from("expense_groups" as any).update({ ...patch, ta_type: method }).eq("id", row.id);
    if (error) {
      toast.error(/role_ids/.test(error.message) ? "Apply the latest migration to save roles" : error.message);
      load(); return;
    }
    setRows((p) => p.map((r) => (r.id === row.id ? next : r)));
  };

  const toggleRow = async (row: TaRow, on: boolean) => {
    setRows((p) => p.map((r) => (r.id === row.id ? { ...r, is_active: on } : r)));
    const { error } = await supabase.from("expense_groups" as any).update({ is_active: on }).eq("id", row.id);
    if (error) {
      toast.error(/is_active/.test(error.message) ? "Apply the latest migration to use this switch" : "Could not update row");
      setRows((p) => p.map((r) => (r.id === row.id ? { ...r, is_active: !on } : r)));
      return;
    }
    toast.success(`${row.name} turned ${on ? "on" : "off"}`);
  };

  const addMembers = async (row: TaRow, sel: { id: string; name: string }[]) => {
    const fresh = sel.filter((s) => !row.members.some((m) => m.id === s.id));
    if (!fresh.length) return;
    const { error } = await supabase.from("expense_group_members" as any)
      .insert(fresh.map((s) => ({ group_id: row.id, user_id: s.id })) as any);
    if (error) { toast.error("Could not add users"); return; }
    setRows((p) => p.map((r) => (r.id === row.id ? { ...r, members: [...r.members, ...fresh] } : r)));
  };

  const removeMember = async (row: TaRow, userId: string) => {
    const { error } = await supabase.from("expense_group_members" as any).delete().eq("group_id", row.id).eq("user_id", userId);
    if (error) { toast.error("Could not remove user"); return; }
    setRows((p) => p.map((r) => (r.id === row.id ? { ...r, members: r.members.filter((m) => m.id !== userId) } : r)));
  };

  const saveDraft = async () => {
    if (!draft) return;
    const rate = Number(draft.rate || 0), fixed = Number(draft.fixed || 0);
    if (!draft.name.trim()) { toast.error("Give the row a name"); return; }
    if ((isFixed ? fixed : rate) <= 0) { toast.error(isFixed ? "Enter a fixed price per day" : "Enter a rate per km"); return; }
    setSavingDraft(true);
    const { error } = await supabase.from("expense_groups" as any).insert({
      name: draft.name.trim(), ta_type: method, fixed_ta_amount: fixed, ta_per_km_rate: rate, da_amount: 0, role_ids: draft.role_ids,
    } as any);
    setSavingDraft(false);
    if (error) { toast.error(/role_ids/.test(error.message) ? "Apply the latest migration to add rows" : error.message); return; }
    toast.success("Row added");
    setDraft(null);
    load();
  };

  const deleteRow = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("expense_groups" as any).delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) { toast.error("Could not delete row"); return; }
    setRows((p) => p.filter((r) => r.id !== deleting.id));
  };

  const addEveryoneCustom = (type: "user" | "team", sel: { id: string; name: string }[]) => {
    sel.forEach((x) => props.onAddOverride(type, x.id, x.name));
    if (dist === "same_for_all") props.onDistChange("custom");
  };

  const save = async () => {
    await props.onSave();
    if (rows.length) {
      await supabase.from("expense_groups" as any).update({ ta_type: method }).in("id", rows.map((r) => r.id));
    }
  };

  const takenOverrideIds = overrides.map((o) => o.ref_id);
  const rowCols = "grid-cols-[1.4fr_1.2fr_1.2fr_1.5fr_2fr_auto]";

  return (
    <Card id="ta-policy" className="overflow-hidden border-border/70 shadow-card">
      <CardContent className="space-y-6 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-xl font-bold"><Car className="h-5 w-5" />Travel Allowance (TA) Policy</h3>
          <Button onClick={save} disabled={props.saving}>
            {props.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
          </Button>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">TA Calculation Method</Label>
          <div className="inline-grid grid-cols-2 overflow-hidden rounded-md border">
            {([{ v: "fixed", l: "Fixed Amount" }, { v: "from_gps", l: "Variable Amount" }] as const).map((o) => (
              <button key={o.v} type="button" onClick={() => props.onMethodChange(o.v)}
                className={cn("px-5 py-2 text-sm font-medium", method === o.v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50")}>
                {o.l}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {isFixed ? "Fixed price per working day. Rate / km is not used." : "TA = GPS km travelled × Rate / km. Fixed price is not used."}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Distribution</Label>
          <RadioGroup value={dist} onValueChange={(v) => changeDist(v as Dist)} className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2"><RadioGroupItem value="same_for_all" id="ta-same" /><Label htmlFor="ta-same" className="font-normal">Same for all</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="custom" id="ta-custom" /><Label htmlFor="ta-custom" className="font-normal">Custom per user/team</Label></div>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-base font-semibold">Default TA</p>
            <p className="text-sm text-muted-foreground">
              {dist === "same_for_all" ? "One rate for everyone. Every user gets this per working day." : "The Everyone row applies to anyone not listed in another row."}
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-card">
            <div className="min-w-[960px]">
              <div className={cn("grid gap-3 px-4 py-3 text-[13px] font-medium text-muted-foreground", rowCols)}>
                <span>Applies to</span>
                <span className={cn(isFixed && "opacity-40")}>Rate / km</span>
                <span className={cn(!isFixed && "opacity-40")}>Fixed price / day</span>
                <span>Assigned roles</span><span>Custom users</span><span className="w-[150px] text-right">Actions</span>
              </div>

              {/* Everyone */}
              <div className={cn("grid items-center gap-3 border-t px-4 py-2.5 text-sm", rowCols, !props.defaultEnabled && "bg-muted/30")}>
                <div className={cn(!props.defaultEnabled && "opacity-50")}><p className="font-semibold">Everyone</p>{dist === "custom" && <p className="text-xs text-muted-foreground">Default</p>}</div>
                <div className={cn(isFixed && "opacity-40")}><MoneyInput value={props.defaultRate} disabled={isFixed} suffix="/km" onCommit={props.onDefaultRateChange} /></div>
                <div className={cn(!isFixed && "opacity-40")}><MoneyInput value={props.defaultFixed} disabled={!isFixed} onCommit={props.onDefaultFixedChange} /></div>
                <div className="text-muted-foreground">All roles</div>
                {dist === "same_for_all" ? (
                  <div className="text-muted-foreground">All users</div>
                ) : (
                <div className="space-y-1.5">
                    {overrides.map((o) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          o.type === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                          {o.type === "user" ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}{o.type === "user" ? "User" : "Team"}
                        </span>
                        <span className="min-w-0 truncate font-medium">{o.name}</span>
                        <OverrideAmount entry={o} suffix={isFixed ? "" : "/km"} onCommit={(n) => props.onUpdateOverride(o.id, n)} />
                        <button type="button" aria-label={`Remove ${o.name}`} onClick={() => props.onDeleteOverride(o)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-1.5 [&_button]:h-7 [&_button]:px-2 [&_button]:text-xs">
                      <MultiProfileSelector excludeIds={takenOverrideIds} label="Add user" onAdd={(s) => addEveryoneCustom("user", s)} />
                      <MultiProfileSelector excludeIds={takenOverrideIds} label="Add team" managersOnly onAdd={(s) => addEveryoneCustom("team", s)} />
                    </div>
                  </div>
                )}
                <OnOffSwitch checked={props.defaultEnabled} label="Everyone" onChange={props.onDefaultEnabledChange} />
              </div>

              {/* Custom rows */}
              {dist === "custom" && (loading ? (
                <div className="flex justify-center border-t py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : rows.map((r) => (
                <div key={r.id} className={cn("grid items-center gap-3 border-t px-4 py-2.5 text-sm", rowCols, !r.is_active && "bg-muted/30")}>
                  <p className={cn("truncate font-semibold", !r.is_active && "opacity-50")}>{r.name}</p>
                  <div className={cn(isFixed && "opacity-40")}><MoneyInput value={r.ta_per_km_rate} disabled={isFixed} suffix="/km" onCommit={(n) => updateRow(r, { ta_per_km_rate: n })} /></div>
                  <div className={cn(!isFixed && "opacity-40")}><MoneyInput value={r.fixed_ta_amount} disabled={!isFixed} onCommit={(n) => updateRow(r, { fixed_ta_amount: n })} /></div>
                  <RoleSelect roles={roles} value={r.role_ids} onChange={(ids) => updateRow(r, { role_ids: ids })} placeholder="No roles" />
                  <div className="space-y-1.5">
                    {r.members.map((m) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"><User className="h-3 w-3" />User</span>
                        <span className="min-w-0 truncate font-medium">{m.name}</span>
                        <button type="button" aria-label={`Remove ${m.name}`} onClick={() => removeMember(r, m.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    <div className="[&_button]:h-7 [&_button]:px-2 [&_button]:text-xs">
                      <MultiProfileSelector excludeIds={r.members.map((m) => m.id)} label="Add user" onAdd={(s) => addMembers(r, s)} />
                    </div>
                  </div>
                  <div className="flex w-[150px] items-center justify-end gap-1">
                    <OnOffSwitch checked={r.is_active} label={r.name} onChange={(v) => toggleRow(r, v)} />
                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Rename ${r.name}`} onClick={() => { setEditing(r); setEditName(r.name); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              )))}

              {/* New row */}
              {dist === "custom" && draft && (
                <div className={cn("grid items-center gap-3 border-t bg-warning/5 px-4 py-2.5 text-sm", rowCols)}>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Row name" className="h-9" autoFocus />
                  <div className={cn("flex items-center gap-1", isFixed && "opacity-40")}>
                    <span className="text-muted-foreground">₹</span>
                    <Input type="number" min="0" step="0.5" value={draft.rate} disabled={isFixed} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} className="h-9 w-24" />
                    <span className="text-xs text-muted-foreground">/km</span>
                  </div>
                  <div className={cn("flex items-center gap-1", !isFixed && "opacity-40")}>
                    <span className="text-muted-foreground">₹</span>
                    <Input type="number" min="0" value={draft.fixed} disabled={!isFixed} onChange={(e) => setDraft({ ...draft, fixed: e.target.value })} className="h-9 w-24" />
                  </div>
                  <RoleSelect roles={roles} value={draft.role_ids} onChange={(ids) => setDraft({ ...draft, role_ids: ids })} placeholder="Select roles" />
                  <p className="text-xs text-muted-foreground">Add users after saving</p>
                  <div className="flex w-[150px] justify-end gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
                    <Button size="sm" onClick={saveDraft} disabled={savingDraft}>{savingDraft && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Save</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {dist === "custom" && !draft && (
            <Button variant="outline" onClick={() => setDraft({ name: "", rate: "", fixed: "", role_ids: [] })}>
              <Plus className="mr-1 h-4 w-4" />Add row
            </Button>
          )}
          {dist === "custom" && (
            <p className="text-xs text-muted-foreground">
              Who gets which rate: a user listed on a row, then a team, then an assigned role, otherwise Everyone. Rows switched off are ignored; if Everyone is off, people not covered by a row get no TA.
            </p>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmSame} onOpenChange={setConfirmSame}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use the same TA for everyone?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {rows.length} custom row{rows.length === 1 ? "" : "s"} and {overrides.length} custom user/team entr{overrides.length === 1 ? "y" : "ies"}. Everyone will get the default.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep custom</AlertDialogCancel>
            <AlertDialogAction onClick={clearCustom}>Remove and switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>People on this row will get the Everyone rate instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRow}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Rename row</AlertDialogTitle></AlertDialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (editing && editName.trim()) updateRow(editing, { name: editName.trim() }); setEditing(null); }}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function OverrideAmount({ entry, suffix, onCommit }: { entry: OverrideEntry; suffix: string; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(entry.amount));
  useEffect(() => setV(String(entry.amount)), [entry.amount]);
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground">
      ₹<Input type="number" min="0" value={v} onChange={(e) => setV(e.target.value)} aria-label={`${entry.name} amount`}
        onBlur={() => { const n = Number(v); if (v !== "" && Number.isFinite(n) && n >= 0 && n !== entry.amount) onCommit(n); else setV(String(entry.amount)); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-7 w-20 px-2 text-xs" />
      {suffix && <span className="text-[11px]">{suffix}</span>}
    </span>
  );
}

function RoleSelect({ roles, value, onChange, placeholder = "All roles" }: {
  roles: Role[]; value: string[]; onChange: (ids: string[]) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(value);
  useEffect(() => { if (!open) setSel(value); }, [value, open]);
  const names = useMemo(() => roles.filter((r) => value.includes(r.id)).map((r) => r.name), [roles, value]);
  const close = (o: boolean) => {
    setOpen(o);
    if (!o && (sel.length !== value.length || sel.some((id) => !value.includes(id)))) onChange(sel);
  };
  return (
    <Popover open={open} onOpenChange={close}>
      <PopoverTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2 text-left hover:bg-muted/40">
          <span className="flex flex-wrap gap-1">
            {names.length ? names.map((n) => <span key={n} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{n}</span>)
              : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="start">
        {roles.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
            <Checkbox checked={sel.includes(r.id)}
              onCheckedChange={(c) => setSel((p) => (c ? [...p, r.id] : p.filter((x) => x !== r.id)))} />
            {r.name}
          </label>
        ))}
        <p className="px-2 pt-1 text-[11px] text-muted-foreground">Saved when you close this list.</p>
      </PopoverContent>
    </Popover>
  );
}

function OnOffSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={`${label} on or off`} />
      <span className={cn("w-7 text-xs font-medium", checked ? "text-foreground" : "text-muted-foreground")}>{checked ? "On" : "Off"}</span>
    </label>
  );
}
