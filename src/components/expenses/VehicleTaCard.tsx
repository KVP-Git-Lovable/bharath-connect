import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bike, Bus, Car as CarIcon, Check, ChevronDown, History, Loader2, MapPinOff, Pencil, Plus, Trash2, Truck, X, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useVehicleTypes, type VehicleType } from "@/hooks/useVehicleTypes";
import type { VehicleRate } from "@/hooks/useVehicleRates";

type Method = "fixed" | "from_gps";
const ICONS: Record<string, any> = { bike: Bike, car: CarIcon, truck: Truck, bus: Bus, "map-pin-off": MapPinOff };
const ICON_KEYS = ["bike", "car", "truck", "bus", "map-pin-off"];
const iconFor = (v: Pick<VehicleType, "icon" | "is_no_vehicle">) => ICONS[v.icon || ""] || (v.is_no_vehicle ? MapPinOff : CarIcon);
const today = () => format(new Date(), "yyyy-MM-dd");
const fmtDate = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), "dd MMM yyyy") : "now");
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const activeRate = (rates: VehicleRate[]) => {
  const t = today();
  return rates.find((r) => r.effective_from <= t && (!r.effective_to || r.effective_to >= t)) || null;
};

interface Role { id: string; name: string }
interface Emp { id: string; name: string }
interface Override { id: string; vehicle_type_id: string; user_id: string; per_km_rate: number | null; fixed_ta_amount: number | null }

interface Props {
  method: Method;
}

export default function VehicleTaCard({ method }: Props) {
  const qc = useQueryClient();
  const { vehicleTypes, loading: vLoading, refetch: refetchVehicles } = useVehicleTypes(false);
  const refData = useQuery({
    queryKey: ["ta-table-refdata"],
    queryFn: async () => {
      const [rates, roles, links, users, ovr] = await Promise.all([
        supabase.from("vehicle_rate_history" as any).select("id, vehicle_type_id, per_km_rate, effective_from, effective_to, note").order("effective_from", { ascending: false }),
        supabase.from("security_profiles" as any).select("id, name").order("name"),
        supabase.from("role_vehicle_types" as any).select("profile_id, vehicle_type_id"),
        supabase.from("users").select("id, full_name, is_active").order("full_name"),
        supabase.from("vehicle_user_overrides" as any).select("id, vehicle_type_id, user_id, per_km_rate, fixed_ta_amount"),
      ]);
      return {
        rates: ((rates.data || []) as any[]).map((r) => ({ ...r, per_km_rate: Number(r.per_km_rate || 0) })) as VehicleRate[],
        roles: ((roles.data || []) as any[]).map((r) => ({ id: r.id, name: r.name })) as Role[],
        links: (links.data || []) as any[] as { profile_id: string; vehicle_type_id: string }[],
        emps: ((users.data || []) as any[]).filter((u) => u.is_active !== false).map((u) => ({ id: u.id, name: u.full_name || "Unnamed" })) as Emp[],
        overrides: ((ovr.data || []) as any[]).map((o) => ({
          ...o,
          per_km_rate: o.per_km_rate == null ? null : Number(o.per_km_rate),
          fixed_ta_amount: o.fixed_ta_amount == null ? null : Number(o.fixed_ta_amount),
        })) as Override[],
        overridesReady: !ovr.error,
      };
    },
  });

  const data = refData.data;
  const reload = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["ta-table-refdata"] });
    qc.invalidateQueries({ queryKey: ["vehicle-types"] });
    qc.invalidateQueries({ queryKey: ["vehicle-rate-history"] });
    refetchVehicles();
  }, [qc, refetchVehicles]);

  const ratesBy = useMemo(() => {
    const m = new Map<string, VehicleRate[]>();
    (data?.rates || []).forEach((r) => m.set(r.vehicle_type_id, [...(m.get(r.vehicle_type_id) || []), r]));
    return m;
  }, [data?.rates]);
  const empName = useMemo(() => new Map((data?.emps || []).map((e) => [e.id, e.name])), [data?.emps]);

  const [vehicleDialog, setVehicleDialog] = useState<{ open: boolean; editing: VehicleType | null }>({ open: false, editing: null });
  // Header switch: on = every vehicle (active and inactive), off = active vehicles only.
  const [showInactive, setShowInactive] = useState(true);
  const sortedVehicles = useMemo(
    () => vehicleTypes
      .filter((v) => showInactive || v.is_active)
      .sort((a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1)),
    [vehicleTypes, showInactive],
  );

  const isFixed = method === "fixed";

  return (
    <Card className="overflow-hidden border-border/70 shadow-card">
      <CardHeader className="flex flex-col gap-3 px-5 pb-2 pt-6 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <CardTitle className="text-lg">Vehicle TA</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">Used when the person picks this vehicle on Activities. Same method as above.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-md border px-3 py-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} aria-label="Show inactive vehicles as well" />
          <span className="text-sm font-medium">{showInactive ? "Active" : "Inactive"}</span>
        </label>
        <Button variant="outline" onClick={() => setVehicleDialog({ open: true, editing: null })}>
          <Plus className="mr-1 h-4 w-4" />Add vehicle
        </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 pb-6 pt-2 sm:px-7">
        {vLoading || refData.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium normal-case tracking-normal">Vehicle</th>
                  <th className={cn("px-3 py-3", isFixed && "opacity-40")}>Rate / km</th>
                  <th className={cn("px-3 py-3", !isFixed && "opacity-40")}>Fixed price / day</th>
                  <th className="px-3 py-3">Assigned roles</th>
                  <th className="px-3 py-3">Custom users</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedVehicles.map((v) => (
                  <VehicleRow key={v.id} v={v} isFixed={isFixed} rates={ratesBy.get(v.id) || []}
                    roles={data?.roles || []} links={data?.links || []}
                    allVehicleIds={vehicleTypes.filter((x) => x.is_active).map((x) => x.id)}
                    emps={data?.emps || []} empName={empName}
                    overrides={(data?.overrides || []).filter((o) => o.vehicle_type_id === v.id)}
                    overridesReady={!!data?.overridesReady}
                    onEdit={() => setVehicleDialog({ open: true, editing: v })} onChanged={reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}

      </CardContent>

      <VehicleDialog state={vehicleDialog} vehicles={vehicleTypes} onClose={() => setVehicleDialog({ open: false, editing: null })} onChanged={reload} />
    </Card>
  );
}

/* ---------- small inline money editor ---------- */
export function MoneyInput({ value, onCommit, disabled, suffix, placeholder }: {
  value: number | null; onCommit: (n: number) => void | Promise<void>; disabled?: boolean; suffix?: string; placeholder?: string;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft === "" || !Number.isFinite(n) || n < 0) { setDraft(value == null ? "" : String(value)); return; }
    if (n !== value) onCommit(n);
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">₹</span>
      <Input type="number" min="0" step="0.5" value={draft} disabled={disabled} placeholder={placeholder ?? "0"}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-9 w-24" />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

/* ---------- one vehicle row ---------- */
function VehicleRow({ v, isFixed, rates, roles, links, allVehicleIds, emps, empName, overrides, overridesReady, onEdit, onChanged }: {
  v: VehicleType; isFixed: boolean; rates: VehicleRate[]; roles: Role[];
  links: { profile_id: string; vehicle_type_id: string }[]; allVehicleIds: string[]; emps: Emp[]; empName: Map<string, string>;
  overrides: Override[]; overridesReady: boolean; onEdit: () => void; onChanged: () => void;
}) {
  const Icon = iconFor(v);
  const cur = activeRate(rates);
  const noTa = v.is_no_vehicle;

  const saveRate = async (n: number) => {
    const t = today();
    try {
      const startsToday = rates.find((r) => r.effective_from === t);
      if (startsToday) {
        const { error } = await supabase.from("vehicle_rate_history" as any).update({ per_km_rate: n }).eq("id", startsToday.id);
        if (error) throw error;
      } else {
        if (cur) {
          const y = new Date(); y.setDate(y.getDate() - 1);
          const { error } = await supabase.from("vehicle_rate_history" as any).update({ effective_to: format(y, "yyyy-MM-dd") }).eq("id", cur.id);
          if (error) throw error;
        }
        const { error } = await supabase.from("vehicle_rate_history" as any)
          .insert({ vehicle_type_id: v.id, per_km_rate: n, effective_from: t, note: "Updated from TA table" } as any);
        if (error) throw error;
      }
      toast.success(`${v.name}: ₹${n}/km from today`);
      onChanged();
    } catch (e: any) { toast.error(e?.message || "Could not save rate"); }
  };

  const saveFixed = async (n: number) => {
    const { error } = await supabase.from("vehicle_types" as any).update({ fixed_ta_amount: n }).eq("id", v.id);
    if (error) { toast.error(/fixed_ta_amount/.test(error.message) ? "Apply the latest migration to enable fixed price per vehicle" : error.message); return; }
    toast.success(`${v.name}: ${inr(n)} per day`);
    onChanged();
  };

  const toggleActive = async (on: boolean) => {
    const { error } = await supabase.from("vehicle_types" as any).update({ is_active: on }).eq("id", v.id);
    if (error) toast.error("Could not update vehicle"); else onChanged();
  };

  return (
    <tr className={cn("border-t align-top", !v.is_active && "bg-muted/10 text-muted-foreground")}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            noTa || !v.is_active ? "bg-muted text-muted-foreground" : "bg-info/10 text-info")}><Icon className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{v.name}</p>
          </div>
        </div>
      </td>

      {noTa ? (
        <td colSpan={2} className="px-3 py-3 text-xs text-muted-foreground">No vehicle used — no TA that day</td>
      ) : (
        <>
          <td className={cn("px-3 py-3", isFixed && "opacity-40")}>
            <div className="flex items-center gap-1">
              <MoneyInput value={cur ? cur.per_km_rate : null} disabled={isFixed} suffix="/km" placeholder="Set" onCommit={saveRate} />
              <RateHistory rates={rates} cur={cur} onChanged={onChanged} />
            </div>
            {!cur && !isFixed && <p className="mt-1 text-xs text-warning">Rate not set</p>}
          </td>
          <td className={cn("px-3 py-3", !isFixed && "opacity-40")}>
            <MoneyInput value={v.fixed_ta_amount} disabled={!isFixed} onCommit={saveFixed} />
          </td>
        </>
      )}

      <td className="px-3 py-3">
        <RolePicker vehicleId={v.id} roles={roles} links={links} allVehicleIds={allVehicleIds} onChanged={onChanged} />
      </td>

      <td className="px-3 py-3">
        {noTa ? <span className="text-xs text-muted-foreground">—</span> : (
          <CustomUsers vehicle={v} isFixed={isFixed} emps={emps} empName={empName} overrides={overrides} ready={overridesReady} onChanged={onChanged} />
        )}
      </td>

      <td className="px-3 py-3">
        <label className="flex items-center gap-2">
          <Switch checked={v.is_active} onCheckedChange={toggleActive} aria-label={`${v.name} on or off`} />
          <span className={cn("text-xs font-medium", v.is_active ? "text-foreground" : "text-muted-foreground")}>{v.is_active ? "Active" : "Off"}</span>
        </label>
      </td>

      <td className="px-3 py-3">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${v.name}`} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <DeleteVehicle v={v} onChanged={onChanged} />
        </div>
      </td>
    </tr>
  );
}

function RateHistory({ rates, cur, onChanged }: { rates: VehicleRate[]; cur: VehicleRate | null; onChanged: () => void }) {
  if (rates.length === 0) return null;
  const remove = async (id: string) => {
    const { error } = await supabase.from("vehicle_rate_history" as any).delete().eq("id", id);
    if (error) toast.error("Could not delete rate"); else { toast.success("Rate removed"); onChanged(); }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Rate history"><History className="h-4 w-4" /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2" align="start">
        <p className="text-sm font-semibold">Rate history</p>
        {rates.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
            <span><b>₹{r.per_km_rate}</b> · {fmtDate(r.effective_from)} → {fmtDate(r.effective_to)}</span>
            <span className="flex items-center gap-1">
              {cur?.id === r.id && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Current</span>}
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Delete rate" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Changing the rate in the table applies from today; past claims keep their old rate.</p>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- roles cell ----------
 * role_vehicle_types semantics: a role with no rows may use every active vehicle.
 * Ticks here show real access, and edits keep that rule intact.
 */
function RolePicker({ vehicleId, roles, links, allVehicleIds, onChanged }: {
  vehicleId: string; roles: Role[]; links: { profile_id: string; vehicle_type_id: string }[];
  allVehicleIds: string[]; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const rowsByRole = useMemo(() => {
    const m = new Map<string, Set<string>>();
    links.forEach((l) => { if (!m.has(l.profile_id)) m.set(l.profile_id, new Set()); m.get(l.profile_id)!.add(l.vehicle_type_id); });
    return m;
  }, [links]);
  const unrestricted = (roleId: string) => !(rowsByRole.get(roleId)?.size);
  const canUse = (roleId: string) => unrestricted(roleId) || rowsByRole.get(roleId)!.has(vehicleId);

  const toggle = async (roleId: string) => {
    setBusy(roleId);
    try {
      if (canUse(roleId)) {
        if (unrestricted(roleId)) {
          // Remove just this vehicle: restrict the role to every other active vehicle.
          const others = allVehicleIds.filter((id) => id !== vehicleId);
          if (others.length === 0) throw new Error("A role needs at least one vehicle");
          const { error } = await supabase.from("role_vehicle_types" as any)
            .insert(others.map((id) => ({ profile_id: roleId, vehicle_type_id: id })) as any);
          if (error) throw error;
        } else {
          const active = [...rowsByRole.get(roleId)!].filter((id) => allVehicleIds.includes(id));
          if (active.length <= 1) throw new Error("A role needs at least one vehicle — tick another vehicle for it first");
          const { error } = await supabase.from("role_vehicle_types" as any).delete().eq("profile_id", roleId).eq("vehicle_type_id", vehicleId);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("role_vehicle_types" as any).insert({ profile_id: roleId, vehicle_type_id: vehicleId } as any);
        if (error) throw error;
      }
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not update roles");
    } finally { setBusy(null); }
  };

  const allowed = roles.filter((r) => canUse(r.id));
  const everyone = allowed.length === roles.length && roles.length > 0;
  const noRoles = roles.length > 0 && allowed.length === 0;

  // "No roles": take this vehicle away from every role (or give it back to all when unticked).
  const setNoRoles = async (on: boolean) => {
    setBusy("__none");
    const skipped: string[] = [];
    try {
      for (const r of roles) {
        if (on && canUse(r.id)) {
          if (unrestricted(r.id)) {
            const others = allVehicleIds.filter((id) => id !== vehicleId);
            if (!others.length) { skipped.push(r.name); continue; }
            const { error } = await supabase.from("role_vehicle_types" as any)
              .insert(others.map((id) => ({ profile_id: r.id, vehicle_type_id: id })) as any);
            if (error) throw error;
          } else {
            const active = [...rowsByRole.get(r.id)!].filter((id) => allVehicleIds.includes(id));
            if (active.length <= 1) { skipped.push(r.name); continue; }
            const { error } = await supabase.from("role_vehicle_types" as any).delete().eq("profile_id", r.id).eq("vehicle_type_id", vehicleId);
            if (error) throw error;
          }
        } else if (!on && !canUse(r.id)) {
          const { error } = await supabase.from("role_vehicle_types" as any).insert({ profile_id: r.id, vehicle_type_id: vehicleId } as any);
          if (error) throw error;
        }
      }
      if (skipped.length) toast.warning(`Kept for ${skipped.join(", ")} — it's their only vehicle. Give them another vehicle first.`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not update roles");
      onChanged();
    } finally { setBusy(null); }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex w-full min-w-[170px] items-start justify-between gap-2 rounded-md border bg-background px-2.5 py-2 text-left hover:bg-muted/40">
          <span className="flex flex-wrap gap-1">
            {everyone ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">All roles</span>
              : allowed.length === 0 ? <span className="text-muted-foreground">No roles</span>
              : allowed.map((r) => <span key={r.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{r.name}</span>)}
          </span>
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="px-2 pb-2 text-xs text-muted-foreground">Tick the roles that can pick this vehicle on Activities.</p>
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
          {busy === "__none" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Checkbox checked={noRoles} onCheckedChange={(c) => setNoRoles(!!c)} />}
          <span className="flex-1 font-medium">No roles</span>
          <span className="text-[10px] text-muted-foreground">nobody can pick it</span>
        </label>
        <div className="my-1 border-t" />
        {roles.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
            {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Checkbox checked={canUse(r.id)} onCheckedChange={() => toggle(r.id)} />}
            <span className="flex-1">{r.name}</span>
            {unrestricted(r.id) && <span className="text-[10px] text-muted-foreground">all vehicles</span>}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- custom users cell ---------- */
function CustomUsers({ vehicle, isFixed, emps, empName, overrides, ready, onChanged }: {
  vehicle: VehicleType; isFixed: boolean; emps: Emp[]; empName: Map<string, string>;
  overrides: Override[]; ready: boolean; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Override | null>(null);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const shown = overrides.filter((o) => (isFixed ? o.fixed_ta_amount != null : o.per_km_rate != null));
  const openFor = (o: Override | null) => {
    setEditing(o);
    setUserIds(o ? [o.user_id] : []);
    setEmpSearch("");
    const val = o ? (isFixed ? o.fixed_ta_amount : o.per_km_rate) : null;
    setAmount(val == null ? "" : String(val));
    setOpen(true);
  };

  const save = async () => {
    const n = Number(amount);
    if (!userIds.length) { toast.error("Select at least one employee"); return; }
    if (amount === "" || !Number.isFinite(n) || n < 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const field = isFixed ? "fixed_ta_amount" : "per_km_rate";
    let error: any = null;
    const existingIds = overrides.filter((o) => userIds.includes(o.user_id)).map((o) => o.id);
    const fresh = userIds.filter((id) => !overrides.some((o) => o.user_id === id));
    if (existingIds.length) {
      ({ error } = await supabase.from("vehicle_user_overrides" as any).update({ [field]: n }).in("id", existingIds));
    }
    if (!error && fresh.length) {
      ({ error } = await supabase.from("vehicle_user_overrides" as any)
        .insert(fresh.map((user_id) => ({ vehicle_type_id: vehicle.id, user_id, [field]: n })) as any));
    }
    setSaving(false);
    if (error) { toast.error(error.message || "Could not save exception"); return; }
    toast.success(userIds.length > 1 ? `Exception saved for ${userIds.length} employees` : "Exception saved");
    setOpen(false);
    onChanged();
  };

  const remove = async (o: Override) => {
    const other = isFixed ? o.per_km_rate : o.fixed_ta_amount;
    const { error } = other == null
      ? await supabase.from("vehicle_user_overrides" as any).delete().eq("id", o.id)
      : await supabase.from("vehicle_user_overrides" as any).update({ [isFixed ? "fixed_ta_amount" : "per_km_rate"]: null }).eq("id", o.id);
    if (error) toast.error("Could not remove exception"); else onChanged();
  };

  if (!ready) return <span className="text-xs text-muted-foreground">Apply latest migration</span>;

  return (
    <div className="min-w-[190px] space-y-1.5">
      {shown.map((o) => (
        <div key={o.id} className="flex items-center justify-between gap-1 rounded-md bg-muted/40 px-2 py-1 text-xs">
          <button type="button" className="truncate text-left hover:underline" onClick={() => openFor(o)}>
            <span className="font-medium text-foreground">{empName.get(o.user_id) || "Unknown"}</span>{" "}
            {isFixed ? `${inr(o.fixed_ta_amount!)}/day` : `₹${o.per_km_rate}/km`}
          </button>
          <button type="button" aria-label="Remove exception" onClick={() => remove(o)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button type="button" onClick={() => openFor(null)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        <Plus className="h-3.5 w-3.5" />Add exception
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} exception — {vehicle.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{editing ? "Employee" : "Employees"}</Label>
              {editing ? (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{empName.get(editing.user_id) || "Unknown"}</p>
              ) : (
                <div className="rounded-md border">
                  <div className="border-b p-2">
                    <Input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search employees" className="h-9" />
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1">
                    {emps.filter((e) => e.name.toLowerCase().includes(empSearch.toLowerCase())).map((e) => {
                      const has = overrides.some((o) => o.user_id === e.id);
                      return (
                        <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                          <Checkbox checked={userIds.includes(e.id)}
                            onCheckedChange={(c) => setUserIds((p) => (c ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
                          <span className="flex-1">{e.name}</span>
                          {has && <span className="text-[10px] text-muted-foreground">has exception</span>}
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between border-t px-3 py-1.5 text-xs text-muted-foreground">
                    <span>{userIds.length} selected</span>
                    {userIds.length > 0 && <button type="button" className="text-primary hover:underline" onClick={() => setUserIds([])}>Clear</button>}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{isFixed ? "Custom fixed price (₹/day)" : "Custom rate (₹/km)"}</Label>
              <Input type="number" min="0" step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground">Used instead of the vehicle’s {isFixed ? "fixed price" : "rate"} for {userIds.length > 1 ? "these employees" : "this employee"}.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- add / edit / delete vehicle ---------- */
function DeleteVehicle({ v, onChanged }: { v: VehicleType; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const del = async () => {
    const { error } = await supabase.from("vehicle_types" as any).delete().eq("id", v.id);
    setOpen(false);
    if (error) { toast.error("This vehicle is already used on Activities — switch it off instead"); return; }
    toast.success(`${v.name} deleted`);
    onChanged();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Delete ${v.name}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3" align="end">
        <p className="text-sm">Delete <b>{v.name}</b>? Its rates, roles and exceptions go too.</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={del}>Delete</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VehicleDialog({ state, vehicles, onClose, onChanged }: {
  state: { open: boolean; editing: VehicleType | null }; vehicles: VehicleType[]; onClose: () => void; onChanged: () => void;
}) {
  const { open, editing } = state;
  const [f, setF] = useState({ name: "", icon: "car", perKm: true, rate: "", fixed: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setF({ name: editing?.name || "", icon: editing?.icon || "car", perKm: editing ? !editing.is_no_vehicle : true, rate: "", fixed: "" });
  }, [open, editing]);

  const save = async () => {
    const name = f.name.trim();
    if (!name) { toast.error("Enter a vehicle name"); return; }
    if (vehicles.some((v) => v.name.toLowerCase() === name.toLowerCase() && v.id !== editing?.id)) { toast.error("A vehicle with this name already exists"); return; }
    setSaving(true);
    try {
      const base = { name, icon: f.icon, is_no_vehicle: !f.perKm };
      if (editing) {
        const { error } = await supabase.from("vehicle_types" as any).update(base).eq("id", editing.id);
        if (error) throw error;
      } else {
        const insert: any = { ...base, is_active: true, sort_order: Math.max(0, ...vehicles.map((v) => v.sort_order)) + 1 };
        if (f.perKm && f.fixed !== "") insert.fixed_ta_amount = Number(f.fixed);
        const { data, error } = await supabase.from("vehicle_types" as any).insert(insert).select("id").single();
        if (error) throw error;
        if (f.perKm && f.rate !== "" && Number(f.rate) > 0) {
          const { error: rErr } = await supabase.from("vehicle_rate_history" as any)
            .insert({ vehicle_type_id: (data as any).id, per_km_rate: Number(f.rate), effective_from: today() } as any);
          if (rErr) throw rErr;
        }
      }
      toast.success(editing ? "Vehicle updated" : `${name} added`);
      onClose();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not save vehicle");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : "Add vehicle"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Vehicle name</Label>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. SUV" autoFocus /></div>
          <div className="space-y-1.5"><Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {ICON_KEYS.map((k) => { const I = ICONS[k]; return (
                <button key={k} type="button" aria-label={k} onClick={() => setF({ ...f, icon: k })}
                  className={cn("flex h-11 w-11 items-center justify-center rounded-md border-2", f.icon === k ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground")}>
                  <I className="h-5 w-5" />
                </button>); })}
            </div>
          </div>
          <div className="space-y-1.5"><Label>Pays travel allowance?</Label>
            <div className="grid grid-cols-2 overflow-hidden rounded-md border">
              {[{ v: true, l: "Yes" }, { v: false, l: "No (like Outstation)" }].map((o) => (
                <button key={String(o.v)} type="button" onClick={() => setF({ ...f, perKm: o.v })}
                  className={cn("px-3 py-2 text-sm font-medium", f.perKm === o.v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>{o.l}</button>
              ))}
            </div>
          </div>
          {!editing && f.perKm && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Rate (₹/km)</Label><Input type="number" min="0" step="0.5" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="e.g. 12" /></div>
              <div className="space-y-1.5"><Label>Fixed price (₹/day)</Label><Input type="number" min="0" value={f.fixed} onChange={(e) => setF({ ...f, fixed: e.target.value })} placeholder="e.g. 500" /></div>
            </div>
          )}
          {editing && <p className="text-xs text-muted-foreground">Change rate and fixed price directly in the table.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
