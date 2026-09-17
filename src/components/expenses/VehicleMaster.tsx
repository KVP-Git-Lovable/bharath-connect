import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Bike, Bus, Car as CarIcon, Check, Loader2, MapPinOff, Pencil, Plus, Search, Trash2, Truck, ArrowLeft, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useVehicleTypes, type VehicleType } from "@/hooks/useVehicleTypes";
import type { VehicleRate } from "@/hooks/useVehicleRates";

const ICONS: Record<string, any> = { bike: Bike, car: CarIcon, truck: Truck, bus: Bus, "map-pin-off": MapPinOff };
const ICON_KEYS = ["bike", "car", "truck", "bus", "map-pin-off"];
const iconFor = (v: Pick<VehicleType, "icon" | "is_no_vehicle">) =>
  ICONS[v.icon || ""] || (v.is_no_vehicle ? MapPinOff : CarIcon);

const todayStr = () => format(new Date(), "yyyy-MM-dd");
const fmtDate = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), "dd MMM yyyy") : "now");
const activeRate = (rates: VehicleRate[]) => {
  const t = todayStr();
  return rates.find((r) => r.effective_from <= t && (!r.effective_to || r.effective_to >= t)) || null;
};

async function fetchAllVehicleRates(): Promise<VehicleRate[]> {
  const { data, error } = await supabase
    .from("vehicle_rate_history" as any)
    .select("id, vehicle_type_id, per_km_rate, effective_from, effective_to, note")
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({ ...r, per_km_rate: Number(r.per_km_rate || 0) }));
}

type Step = 1 | 2 | 3;

export default function VehicleMaster() {
  const queryClient = useQueryClient();
  const { vehicleTypes, loading: vLoading, refetch: refetchVehicles } = useVehicleTypes(false);
  const ratesQuery = useQuery({ queryKey: ["vehicle-rate-history", "all"], queryFn: fetchAllVehicleRates });
  const allRates = ratesQuery.data || [];
  const [step, setStep] = useState<Step>(1);

  const ratesByVehicle = useMemo(() => {
    const m = new Map<string, VehicleRate[]>();
    allRates.forEach((r) => m.set(r.vehicle_type_id, [...(m.get(r.vehicle_type_id) || []), r]));
    return m;
  }, [allRates]);

  const refreshRates = () => queryClient.invalidateQueries({ queryKey: ["vehicle-rate-history"] });
  const refreshVehicles = () => { refetchVehicles(); queryClient.invalidateQueries({ queryKey: ["vehicle-types"] }); };

  const needsRate = vehicleTypes.filter((v) => v.is_active && !v.is_no_vehicle && !activeRate(ratesByVehicle.get(v.id) || []));
  const activeCount = vehicleTypes.filter((v) => v.is_active).length;

  const steps: { n: Step; title: string; sub: string; done: boolean }[] = [
    { n: 1, title: "Vehicles", sub: `${activeCount} active`, done: activeCount > 0 },
    { n: 2, title: "Rates", sub: needsRate.length ? `${needsRate.length} need a rate` : "₹ per km", done: needsRate.length === 0 && activeCount > 0 },
    { n: 3, title: "Role access", sub: "Who can use what", done: false },
  ];

  return (
    <Card id="vehicle-master" className="scroll-mt-28 overflow-hidden border-border/70 shadow-card">
      <CardHeader className="border-b border-border/60 bg-info/5 px-5 py-5 sm:px-7">
        <CardTitle className="flex items-center gap-3 text-lg">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-info/10 text-info"><CarIcon className="h-5 w-5" /></span>
          <span>Vehicle Master
            <span className="mt-0.5 block text-sm font-normal text-muted-foreground">Set up vehicles, their per-km rate, and which roles can use them — in three steps.</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-5 sm:p-7">
        {/* Stepper */}
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((s) => {
            const current = step === s.n;
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => setStep(s.n)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors",
                  current ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40",
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  current ? "bg-primary text-primary-foreground" : s.done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
                )}>
                  {!current && s.done ? <Check className="h-4 w-4" /> : s.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {s.n}</span>
                  <span className="block font-semibold text-foreground">{s.title}</span>
                  <span className={cn("block truncate text-xs", s.n === 2 && needsRate.length ? "text-warning" : "text-muted-foreground")}>{s.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {vLoading || ratesQuery.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : step === 1 ? (
          <VehiclesStep vehicles={vehicleTypes} ratesByVehicle={ratesByVehicle} needsRateCount={needsRate.length}
            onChanged={refreshVehicles} onNext={() => setStep(2)} />
        ) : step === 2 ? (
          <RatesStep vehicles={vehicleTypes.filter((v) => v.is_active)} ratesByVehicle={ratesByVehicle}
            onChanged={refreshRates} onBack={() => setStep(1)} onNext={() => setStep(3)} />
        ) : (
          <RoleAccessStep vehicles={vehicleTypes.filter((v) => v.is_active)} onBack={() => setStep(2)} />
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Step 1: Vehicles ---------------- */

function VehiclesStep({ vehicles, ratesByVehicle, needsRateCount, onChanged, onNext }: {
  vehicles: VehicleType[]; ratesByVehicle: Map<string, VehicleRate[]>; needsRateCount: number;
  onChanged: () => void; onNext: () => void;
}) {
  const [editing, setEditing] = useState<VehicleType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "car", perKm: true });
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEditing(null); setForm({ name: "", icon: "car", perKm: true }); setFormOpen(true); };
  const openEdit = (v: VehicleType) => { setEditing(v); setForm({ name: v.name, icon: v.icon || "car", perKm: !v.is_no_vehicle }); setFormOpen(true); };

  const toggleActive = async (v: VehicleType, active: boolean) => {
    const { error } = await supabase.from("vehicle_types" as any).update({ is_active: active }).eq("id", v.id);
    if (error) toast.error("Could not update vehicle"); else onChanged();
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) { toast.error("Enter a vehicle name"); return; }
    if (vehicles.some((v) => v.name.toLowerCase() === name.toLowerCase() && v.id !== editing?.id)) {
      toast.error("A vehicle with this name already exists"); return;
    }
    setSaving(true);
    const payload = { name, icon: form.icon, is_no_vehicle: !form.perKm };
    const { error } = editing
      ? await supabase.from("vehicle_types" as any).update(payload).eq("id", editing.id)
      : await supabase.from("vehicle_types" as any).insert({
          ...payload, is_active: true, sort_order: Math.max(0, ...vehicles.map((v) => v.sort_order)) + 1,
        } as any);
    setSaving(false);
    if (error) { toast.error(error.message || "Could not save vehicle"); return; }
    toast.success(editing ? "Vehicle updated" : `${name} added${form.perKm ? " — set its rate in step 2" : ""}`);
    setFormOpen(false);
    onChanged();
  };

  const remove = async () => {
    if (!editing) return;
    const { error } = await supabase.from("vehicle_types" as any).delete().eq("id", editing.id);
    if (error) { toast.error("This vehicle is already used on Activities — switch it off instead"); return; }
    toast.success("Vehicle removed");
    setFormOpen(false);
    onChanged();
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="font-semibold text-foreground">Which vehicles does your team use?</p>
        <p className="text-sm text-muted-foreground">Only switched-on vehicles appear in the Activities vehicle picker.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {vehicles.map((v) => {
          const Icon = iconFor(v);
          const rate = activeRate(ratesByVehicle.get(v.id) || []);
          const status = !v.is_active
            ? { label: "Inactive", cls: "bg-muted text-muted-foreground" }
            : v.is_no_vehicle
              ? { label: "No vehicle", cls: "bg-muted text-muted-foreground" }
              : rate
                ? { label: "Active", cls: "bg-success/10 text-success" }
                : { label: "Needs rate", cls: "bg-warning/10 text-warning" };
          return (
            <div key={v.id} className={cn(
              "flex flex-col gap-3 rounded-lg border p-3",
              v.is_no_vehicle ? "border-dashed bg-muted/20" : "bg-background",
              !v.is_active && "opacity-70",
            )}>
              <div className="flex items-center justify-between">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-md",
                  v.is_no_vehicle || !v.is_active ? "bg-muted text-muted-foreground" : "bg-info/10 text-info")}>
                  <Icon className="h-5 w-5" />
                </span>
                <Switch checked={v.is_active} onCheckedChange={(val) => toggleActive(v, val)} aria-label={`${v.name} active`} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{v.name}</p>
                <p className="text-xs text-muted-foreground">
                  {v.is_no_vehicle ? "No per-km TA" : rate ? `₹${rate.per_km_rate} / km` : "Rate not set"}
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.cls)}>{status.label}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(v)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                </Button>
              </div>
            </div>
          );
        })}
        <button type="button" onClick={openAdd}
          className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-primary hover:bg-primary/5">
          <Plus className="h-5 w-5" /><span className="text-sm font-semibold">Add vehicle</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-sm", needsRateCount ? "text-warning" : "text-muted-foreground")}>
          {needsRateCount ? `${needsRateCount} active vehicle${needsRateCount > 1 ? "s" : ""} still need${needsRateCount > 1 ? "" : "s"} a rate.` : "All active vehicles have a rate."}
        </p>
        <Button onClick={onNext}>Next: Set rates<ArrowRight className="ml-1 h-4 w-4" /></Button>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : "Add vehicle"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Vehicle name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Auto-rickshaw" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {ICON_KEYS.map((k) => {
                  const I = ICONS[k];
                  return (
                    <button key={k} type="button" aria-label={k} onClick={() => setForm({ ...form, icon: k })}
                      className={cn("flex h-11 w-11 items-center justify-center rounded-md border-2",
                        form.icon === k ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground")}>
                      <I className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Paid per km?</Label>
              <div className="grid grid-cols-2 overflow-hidden rounded-md border">
                {[{ v: true, l: "Yes, per-km rate" }, { v: false, l: "No (like Outstation)" }].map((o) => (
                  <button key={String(o.v)} type="button" onClick={() => setForm({ ...form, perKm: o.v })}
                    className={cn("px-3 py-2 text-sm font-medium", form.perKm === o.v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
                    {o.l}
                  </button>
                ))}
              </div>
              {!form.perKm && <p className="text-xs text-muted-foreground">Picking this on Activities means no vehicle was used, so no per-km TA that day.</p>}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save vehicle</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Step 2: Rates ---------------- */

function RatesStep({ vehicles, ratesByVehicle, onChanged, onBack, onNext }: {
  vehicles: VehicleType[]; ratesByVehicle: Map<string, VehicleRate[]>;
  onChanged: () => void; onBack: () => void; onNext: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ rate: "", from: todayStr(), note: "" });
  const [saving, setSaving] = useState(false);

  const open = (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setForm({ rate: "", from: todayStr(), note: "" });
  };

  const saveRate = async (v: VehicleType) => {
    const rates = ratesByVehicle.get(v.id) || [];
    const value = Number(form.rate);
    if (!Number.isFinite(value) || value <= 0) { toast.error("Enter a valid rate per km"); return; }
    if (!form.from) { toast.error("Pick a start date"); return; }
    if (rates.some((r) => r.effective_from === form.from)) { toast.error("A rate already starts on this date"); return; }
    setSaving(true);
    try {
      const prev = rates.find((r) => r.effective_from < form.from && (!r.effective_to || r.effective_to >= form.from));
      if (prev) {
        const end = new Date(`${form.from}T00:00:00`);
        end.setDate(end.getDate() - 1);
        const { error } = await supabase.from("vehicle_rate_history" as any)
          .update({ effective_to: format(end, "yyyy-MM-dd") }).eq("id", prev.id);
        if (error) throw error;
      }
      // If a later rate already exists, the new one ends the day before it.
      const next = [...rates].filter((r) => r.effective_from > form.from).sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0];
      let effective_to: string | null = null;
      if (next) {
        const end = new Date(`${next.effective_from}T00:00:00`);
        end.setDate(end.getDate() - 1);
        effective_to = format(end, "yyyy-MM-dd");
      }
      const { error } = await supabase.from("vehicle_rate_history" as any).insert({
        vehicle_type_id: v.id, per_km_rate: value, effective_from: form.from, effective_to, note: form.note.trim() || null,
      } as any);
      if (error) throw error;
      toast.success(`${v.name} rate saved — past claims keep their old rate`);
      setOpenId(null);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not save the rate");
    } finally {
      setSaving(false);
    }
  };

  const removeRate = async (id: string) => {
    const { error } = await supabase.from("vehicle_rate_history" as any).delete().eq("id", id);
    if (error) { toast.error("Could not delete the rate"); return; }
    toast.success("Rate removed");
    onChanged();
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="font-semibold text-foreground">How much is paid per km?</p>
        <p className="text-sm text-muted-foreground">TA for a day uses the rate of the vehicle picked on the Activities page that day. Only active vehicles are listed.</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[2fr_1.3fr_1.3fr_1fr_1.4fr] gap-3 bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
          <span>Vehicle</span><span>Current rate</span><span>Since</span><span>History</span><span className="text-right">Action</span>
        </div>
        {vehicles.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No active vehicles. Switch one on in step 1.</p>}
        {vehicles.map((v) => {
          const Icon = iconFor(v);
          const rates = ratesByVehicle.get(v.id) || [];
          const cur = activeRate(rates);
          const isOpen = openId === v.id;
          const upcoming = rates.filter((r) => r.effective_from > todayStr());
          return (
            <div key={v.id} className={cn("border-t first:border-t-0", isOpen && "bg-primary/5")}>
              <div className="grid grid-cols-2 items-center gap-3 px-4 py-3 md:grid-cols-[2fr_1.3fr_1.3fr_1fr_1.4fr]">
                <div className="col-span-2 flex items-center gap-3 md:col-span-1">
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-md", v.is_no_vehicle ? "bg-muted text-muted-foreground" : "bg-info/10 text-info")}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-semibold">{v.name}</span>
                  {upcoming.length > 0 && <Badge variant="secondary" className="text-[10px]">Change scheduled</Badge>}
                </div>
                <div>
                  {v.is_no_vehicle ? <span className="text-sm text-muted-foreground">No per-km TA</span>
                    : cur ? <><span className="text-lg font-bold">₹{cur.per_km_rate}</span><span className="text-xs text-muted-foreground"> / km</span></>
                    : <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">Not set</span>}
                </div>
                <div className="text-sm">{cur ? fmtDate(cur.effective_from) : "—"}</div>
                <div className="text-sm">
                  {!v.is_no_vehicle && rates.length > 0
                    ? <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => open(v.id)}>{rates.length} {rates.length === 1 ? "entry" : "entries"}</button>
                    : <span className="text-muted-foreground">—</span>}
                </div>
                <div className="col-span-2 flex md:col-span-1 md:justify-end">
                  {v.is_no_vehicle ? <span className="text-xs text-muted-foreground">Not applicable</span>
                    : <Button size="sm" variant={cur ? "outline" : "default"} onClick={() => open(v.id)}>
                        {isOpen ? "Close" : cur ? "Change rate" : "Set rate"}
                      </Button>}
                </div>
              </div>

              {isOpen && !v.is_no_vehicle && (
                <div className="grid gap-6 px-4 pb-5 md:pl-[4.25rem] lg:grid-cols-[1.6fr_1fr]">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">{cur ? `Change ${v.name} rate` : `Set ${v.name} rate`}</p>
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.6fr]">
                      <div className="space-y-1"><Label className="text-xs">New rate (₹/km)</Label>
                        <Input type="number" min="0" step="0.5" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="e.g. 9" autoFocus /></div>
                      <div className="space-y-1"><Label className="text-xs">Starts from</Label>
                        <Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></div>
                      <div className="space-y-1"><Label className="text-xs">Reason (optional)</Label>
                        <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. fuel price revision" /></div>
                    </div>
                    {cur && form.from > cur.effective_from && (
                      <p className="text-xs text-muted-foreground">
                        ₹{cur.per_km_rate} stays in effect until {(() => { const d = new Date(`${form.from}T00:00:00`); d.setDate(d.getDate() - 1); return format(d, "dd MMM yyyy"); })()}. Past claims are not changed.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setOpenId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => saveRate(v)} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save new rate</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Rate history</p>
                    {rates.length === 0 && <p className="text-xs text-muted-foreground">No rates yet.</p>}
                    {rates.map((r) => {
                      const state = cur?.id === r.id ? "Current" : r.effective_from > todayStr() ? "Upcoming" : "Past";
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <b>₹{r.per_km_rate}</b> · {fmtDate(r.effective_from)} → {fmtDate(r.effective_to)}
                            {r.note && <span className="block truncate text-xs text-muted-foreground">{r.note}</span>}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              state === "Current" ? "bg-success/10 text-success" : state === "Upcoming" ? "bg-info/10 text-info" : "bg-muted text-muted-foreground")}>{state}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete rate" onClick={() => removeRate(r.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-4">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Back: Vehicles</Button>
        <Button onClick={onNext}>Next: Role access<ArrowRight className="ml-1 h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/* ---------------- Step 3: Role access ---------------- */

interface Role { id: string; name: string }

function RoleAccessStep({ vehicles, onBack }: { vehicles: VehicleType[]; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [roles, setRoles] = useState<Role[]>([]);
  const [saved, setSaved] = useState<Map<string, Set<string>>>(new Map());
  const [draft, setDraft] = useState<Map<string, { mode: "all" | "selected"; ids: Set<string> }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [previewRole, setPreviewRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rolesRes, elgRes] = await Promise.all([
      supabase.from("security_profiles" as any).select("id, name").order("name"),
      supabase.from("role_vehicle_types" as any).select("profile_id, vehicle_type_id"),
    ]);
    const rs = ((rolesRes.data || []) as any[]).map((r) => ({ id: r.id, name: r.name }));
    const m = new Map<string, Set<string>>();
    ((elgRes.data || []) as any[]).forEach((r) => {
      if (!m.has(r.profile_id)) m.set(r.profile_id, new Set());
      m.get(r.profile_id)!.add(r.vehicle_type_id);
    });
    const d = new Map<string, { mode: "all" | "selected"; ids: Set<string> }>();
    rs.forEach((r) => {
      const ids = m.get(r.id) || new Set<string>();
      d.set(r.id, { mode: ids.size ? "selected" : "all", ids: new Set(ids) });
    });
    setRoles(rs); setSaved(m); setDraft(d); setLoading(false);
    if (rs.length) setPreviewRole((p) => p ?? rs[0].id);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setMode = (roleId: string, mode: "all" | "selected") =>
    setDraft((p) => { const n = new Map(p); const cur = n.get(roleId)!; n.set(roleId, { mode, ids: new Set(cur.ids) }); return n; });

  const toggle = (roleId: string, vId: string) =>
    setDraft((p) => {
      const n = new Map(p); const cur = n.get(roleId)!; const ids = new Set(cur.ids);
      ids.has(vId) ? ids.delete(vId) : ids.add(vId);
      n.set(roleId, { mode: "selected", ids });
      return n;
    });

  // What would be stored for a role: "all" (or "selected" with nothing ticked) = no rows.
  const effective = (roleId: string) => {
    const d = draft.get(roleId);
    if (!d || d.mode === "all") return new Set<string>();
    return d.ids;
  };
  const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  const changedRoles = roles.filter((r) => !same(effective(r.id), saved.get(r.id) || new Set()));

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of changedRoles) {
        const want = effective(r.id);
        const have = saved.get(r.id) || new Set<string>();
        const toDelete = [...have].filter((x) => !want.has(x));
        const toInsert = [...want].filter((x) => !have.has(x));
        if (toDelete.length) {
          const { error } = await supabase.from("role_vehicle_types" as any).delete().eq("profile_id", r.id).in("vehicle_type_id", toDelete);
          if (error) throw error;
        }
        if (toInsert.length) {
          const { error } = await supabase.from("role_vehicle_types" as any)
            .insert(toInsert.map((vehicle_type_id) => ({ profile_id: r.id, vehicle_type_id })) as any);
          if (error) throw error;
        }
      }
      toast.success("Vehicle access saved");
      queryClient.invalidateQueries({ queryKey: ["role-vehicle-types"] });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not save access");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const shown = roles.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const preview = roles.find((r) => r.id === previewRole);
  const previewIds = preview ? effective(preview.id) : new Set<string>();
  const previewNames = vehicles.filter((v) => !previewIds.size || previewIds.has(v.id)).map((v) => v.name);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-semibold text-foreground">Who can use which vehicle?</p>
          <p className="text-sm text-muted-foreground">Every role gets all active vehicles by default. Switch a role to “Only selected” and tap the vehicles it may use.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search roles" className="pl-9" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[1.3fr_auto_2.6fr] gap-4 bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
          <span>Role</span><span className="w-[220px]">Access</span><span>Vehicles allowed</span>
        </div>
        {shown.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No roles found.</p>}
        {shown.map((r) => {
          const d = draft.get(r.id)!;
          const isAll = d.mode === "all";
          const picked = vehicles.filter((v) => d.ids.has(v.id)).length;
          const dirty = changedRoles.some((c) => c.id === r.id);
          return (
            <div key={r.id} onClick={() => setPreviewRole(r.id)}
              className={cn("grid gap-3 border-t px-4 py-3 first:border-t-0 md:grid-cols-[1.3fr_auto_2.6fr] md:items-center md:gap-4",
                previewRole === r.id && "bg-primary/5")}>
              <div>
                <p className="font-semibold">{r.name}{dirty && <span className="ml-2 text-xs font-medium text-warning">• unsaved</span>}</p>
                <p className="text-xs text-muted-foreground">
                  {isAll ? "Sees every active vehicle" : picked ? `Sees ${picked} of ${vehicles.length}` : "Nothing ticked — will see every vehicle"}
                </p>
              </div>
              <div className="grid w-full grid-cols-2 overflow-hidden rounded-md border md:w-[220px]">
                {(["all", "selected"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(r.id, m)}
                    className={cn("px-3 py-2 text-xs font-semibold", d.mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
                    {m === "all" ? "All vehicles" : "Only selected"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {vehicles.map((v) => {
                  const on = isAll || d.ids.has(v.id);
                  return (
                    <button key={v.id} type="button" disabled={isAll} onClick={() => toggle(r.id, v.id)}
                      className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                        isAll ? "cursor-default border-border/60 bg-muted/50 text-muted-foreground"
                          : on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted/50")}>
                      {on && <Check className="h-3.5 w-3.5" />}{v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {preview && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span><b>Preview:</b> a {preview.name} will see{" "}
            {previewNames.length ? previewNames.map((n, i) => <span key={n}><b>{n}</b>{i < previewNames.length - 2 ? ", " : i === previewNames.length - 2 ? " and " : ""}</span>) : "no vehicles"}{" "}
            in the Activities vehicle picker.</span>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Back: Rates</Button>
        <div className="flex items-center justify-end gap-3">
          {changedRoles.length > 0 && <span className="text-sm text-muted-foreground">{changedRoles.length} unsaved change{changedRoles.length > 1 ? "s" : ""}</span>}
          <Button onClick={saveAll} disabled={saving || changedRoles.length === 0}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save access
          </Button>
        </div>
      </div>
    </div>
  );
}
