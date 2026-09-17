import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Bike, Bus, Car as CarIcon, Gauge, HelpCircle, IndianRupee, MapPinOff, Truck, Loader2, Paperclip, RefreshCw, Route, Timer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeTravelForCheckIn,
  explainMissingTravel,
  uploadTravelProof,
  TRAVEL_PROOF_BUCKET,
  type TravelProofEntry,
} from "@/utils/activityTravel";
import { resolveSignedUrl } from "@/utils/signedStorage";
import { useTaRates } from "@/hooks/useTaRates";
import { useActivityTravelExpense, type ActivityTravelExpense } from "@/hooks/useActivityTravelExpense";
import type { Activity } from "@/hooks/useActivities";


function Help({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Help" className="text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Field({ icon, label, help, value }: { icon: React.ReactNode; label: string; help: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {label} <Help text={help} />
      </p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const SOURCE_LABEL: Record<ActivityTravelExpense["rate_source"], (vehicle: string) => string> = {
  no_vehicle: () => "No vehicle used",
  personal_vehicle: (v) => `Your ${v} rate`,
  vehicle: (v) => `Standard ${v} rate`,
  user: () => "Your personal TA",
  team: () => "Your team's TA",
  row: () => "Your TA row",
  role: () => "Your role's TA",
  default: () => "Company default",
};

function vehicleIcon(name: string | null, noVehicle: boolean) {
  if (noVehicle) return MapPinOff;
  const n = (name || "").toLowerCase();
  if (n.includes("bike")) return Bike;
  if (n.includes("truck")) return Truck;
  if (n.includes("bus")) return Bus;
  return CarIcon;
}

function TravelExpenseTile({ exp, km }: { exp: ActivityTravelExpense; km: number | null }) {
  const vehicle = exp.vehicle_name || "No vehicle";
  const VIcon = vehicleIcon(exp.vehicle_name, exp.is_no_vehicle);
  const fixed = exp.method === "fixed";
  const amount = exp.is_no_vehicle ? 0 : fixed ? exp.rate : km != null ? Math.round(km * exp.rate * 100) / 100 : null;
  const source = SOURCE_LABEL[exp.rate_source]?.(vehicle) ?? "";
  const vehicleWhen = exp.vehicle_source === "activity" ? "saved when this activity was checked in"
    : exp.vehicle_source === "day" ? "the vehicle recorded for this day" : "no vehicle was chosen";
  const help = exp.is_no_vehicle
    ? "Outstation / no vehicle: no travel allowance for this trip."
    : `Vehicle: ${vehicle} (${vehicleWhen}). Rate: ${source}. ` +
      (fixed ? "Fixed method pays per working day, so every activity that day shows the same day amount."
             : "Variable method: distance (or your meter reading) × rate per km.");
  return (
    <div className="rounded-lg border-[1.5px] border-amber-400 bg-amber-50/60 p-2.5 dark:bg-amber-950/20">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        <IndianRupee className="h-3 w-3" /> Travel expense <Help text={help} />
      </p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="text-base font-bold">{amount != null ? inr(amount) : "—"}</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
          <VIcon className="h-3 w-3" />{vehicle}
        </span>
      </div>
      <div className="mt-1.5 space-y-0.5 border-t border-dashed border-amber-300 pt-1.5 text-[11px]">
        {exp.is_no_vehicle ? (
          <p className="flex justify-between"><span className="text-muted-foreground">No vehicle used</span><span className="font-semibold">no TA</span></p>
        ) : fixed ? (
          <>
            <p className="flex justify-between"><span className="text-muted-foreground">{vehicle} · per day</span><span className="font-semibold">{inr(exp.rate)}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Counted</span><span className="font-semibold">once that day</span></p>
          </>
        ) : (
          <>
            <p className="flex justify-between">
              <span className="text-muted-foreground">{km != null ? `${km} km × ${inr(exp.rate)}/km` : `${inr(exp.rate)}/km`}</span>
              <span className="font-semibold">{amount != null ? `= ${inr(amount)}` : "distance needed"}</span>
            </p>
            <p className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-semibold">{source}</span></p>
          </>
        )}
      </div>
    </div>
  );
}

export default function ActivityEffortSection({
  activity,
  onSaved,
  onNavigateAway,
}: {
  activity: Activity;
  onSaved?: () => void;
  onNavigateAway?: () => void;
}) {
  const navigate = useNavigate();
  const { rateFor } = useTaRates();
  const { data: expense } = useActivityTravelExpense(activity.id);
  const existingProofs = (activity.manual_distance_attachments || []) as TravelProofEntry[];

  const [manualKm, setManualKm] = useState(
    activity.manual_distance_km != null ? String(activity.manual_distance_km) : ""
  );
  const [note, setNote] = useState(activity.manual_distance_note || "");
  const [proofs, setProofs] = useState<TravelProofEntry[]>(existingProofs);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Older records completed without a check-in have no start_time — fall back
  // to the recorded in-progress transition so the value is never wrong.
  const historyStart =
    [...((activity.status_history as any[]) || [])].reverse().find((h: any) => h?.status === "in_progress")?.at ||
    null;
  // A real check-in is required: prefer the recorded in-progress transition,
  // otherwise the stamped start time. Never show 0 min for an activity that was
  // completed straight away without ever being checked in.
  const meetingStart = historyStart || activity.start_time || null;
  const rawMins =
    meetingStart && activity.end_time
      ? Math.round((new Date(activity.end_time).getTime() - new Date(meetingStart).getTime()) / 60000)
      : null;
  const meetingMins = rawMins != null && rawMins > 0 ? rawMins : historyStart && rawMins === 0 ? 0 : null;

  // Travel values shown here. Kept in local state so a recalculation shows
  // immediately, even where the parent doesn't refetch (e.g. the edit form).
  const [travel, setTravel] = useState({
    km: activity.travel_distance_km != null ? Number(activity.travel_distance_km) : null,
    mins: activity.travel_time_mins != null ? Number(activity.travel_time_mins) : null,
    fromType: (activity.travel_from_type as string | null) ?? null,
    fromActivityId: (activity.travel_from_activity_id as string | null) ?? null,
  });
  const [travelReason, setTravelReason] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const checkInEntry = [...((activity.status_history as any[]) || [])]
    .reverse()
    .find((h: any) => h?.status === "in_progress");
  const checkInAt: string | null = checkInEntry?.at || activity.start_time || null;
  const ownerId: string | undefined = (activity as any).user_id;

  const recalculate = async () => {
    if (!ownerId) return;
    setRecalculating(true);
    setTravelReason(null);
    try {
      const result = checkInAt
        ? await computeTravelForCheckIn({
            userId: ownerId,
            activityId: activity.id,
            activityDate: activity.activity_date,
            checkInAt,
            lat: checkInEntry?.lat ?? activity.status_change_lat ?? null,
            lng: checkInEntry?.lng ?? activity.status_change_lng ?? null,
          })
        : null;
      if (!result) {
        setTravelReason(await explainMissingTravel({ userId: ownerId, activityDate: activity.activity_date, checkInAt }));
        return;
      }
      setTravel({
        km: result.travel_distance_km,
        mins: result.travel_time_mins,
        fromType: result.travel_from_type,
        fromActivityId: result.travel_from_activity_id,
      });
      if (result.travel_distance_km == null) {
        setTravelReason("Travel time is from the check-in times. Distance needs GPS points or check-in locations, and none were recorded for this trip.");
      }
      const { error } = await supabase.from("activity_events").update(result).eq("id", activity.id);
      if (!error) onSaved?.();
    } catch (e) {
      console.warn("[ActivityEffortSection] travel recompute failed", e);
      setTravelReason("Travel could not be calculated. Tap Recalculate to try again.");
    } finally {
      setRecalculating(false);
    }
  };

  // Self-heal once: activities checked in before the travel fix have no
  // travel values stored.
  const healedRef = useRef(false);
  useEffect(() => {
    if (healedRef.current) return;
    healedRef.current = true;
    if (activity.travel_time_mins != null || activity.travel_from_type != null) return;
    if (!ownerId) return;
    if (!checkInAt) {
      setTravelReason("Travel is measured when the activity is checked in.");
      return;
    }
    void recalculate();
  }, [activity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevLabel =
    travel.fromType === "attendance"
      ? "Attendance (day check-in)"
      : travel.fromActivityId
        ? "Previous activity"
        : "Not available";

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: TravelProofEntry[] = [];
      for (const f of Array.from(files)) uploaded.push(await uploadTravelProof(f));
      setProofs((p) => [...p, ...uploaded]);
    } catch (e: any) {
      toast.error(e?.message || "Could not upload the attachment");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openProof = async (p: TravelProofEntry) => {
    const url = await resolveSignedUrl(TRAVEL_PROOF_BUCKET, p.url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error("Could not open the attachment");
  };

  const save = async () => {
    const km = manualKm.trim() === "" ? null : Number(manualKm);
    if (km != null && (!Number.isFinite(km) || km < 0)) {
      toast.error("Enter a valid distance in KM");
      return;
    }
    if (km != null && proofs.length === 0) {
      toast.error("Attach at least one proof for the manually entered distance");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("activity_events")
        .update({
          manual_distance_km: km,
          manual_distance_note: note.trim() || null,
          manual_distance_attachments: proofs as any,
        })
        .eq("id", activity.id);
      if (error) throw error;
      toast.success("Effort details saved");
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Could not save the effort details");
    } finally {
      setSaving(false);
    }
  };

  const effectiveKm =
    activity.manual_distance_km != null ? Number(activity.manual_distance_km) : travel.km;
  const perKmRate = rateFor(activity.activity_date);
  const travelCost = effectiveKm != null ? effectiveKm * perKmRate : null;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="text-xs font-semibold">Effort</p>

      <div className="grid grid-cols-2 gap-2">
        <Field
          icon={<Route className="h-3 w-3" />}
          label="Distance travelled"
          help="From the previous activity, in KM"
          value={recalculating ? "…" : travel.km != null ? `${travel.km} km` : "—"}
        />
        <Field
          icon={<Timer className="h-3 w-3" />}
          label="Travel time"
          help="From the previous activity"
          value={recalculating ? "…" : travel.mins != null ? `${travel.mins} min` : "—"}
        />
        <Field
          icon={<Timer className="h-3 w-3" />}
          label="Meeting time"
          help="Time spent with the customer (check-out time − check-in time)"
          value={meetingMins != null ? `${meetingMins} min` : "—"}
        />
        {expense ? (
          <TravelExpenseTile exp={expense} km={effectiveKm} />
        ) : (
          <Field
            icon={<IndianRupee className="h-3 w-3" />}
            label="Travel expense"
            help={`Distance × the per KM rate effective on this activity's date (₹${perKmRate}/km)`}
            value={travelCost != null ? `₹${travelCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
          />
        )}
        <div className="col-span-2 rounded-lg border bg-muted/30 p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Previous activity considered
            <Help text="The record used as the starting point for the travel calculation" />
          </p>
          {travel.fromActivityId ? (
            <button
              type="button"
              className="mt-0.5 block text-left text-sm font-semibold text-primary underline underline-offset-2"
              onClick={() => {
                onNavigateAway?.();
                navigate(`/activities?id=${travel.fromActivityId}`);
              }}
            >
              {prevLabel}
            </button>
          ) : (
            <p className="mt-0.5 text-sm font-semibold">{prevLabel}</p>
          )}
          {travelReason && <p className="mt-1 text-xs text-muted-foreground">{travelReason}</p>}
          {checkInAt && ownerId && (travel.km == null || travel.mins == null) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={recalculate}
              disabled={recalculating}
            >
              {recalculating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Recalculate
            </Button>
          )}
        </div>
      </div>


      {/* Manual (contested) distance */}
      <div className="space-y-2 rounded-lg border border-dashed p-2.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <Gauge className="h-3.5 w-3.5" /> If inaccurate — enter meter reading distance (KM)
          <Help text="Use this only when the automatic distance is wrong. At least one proof attachment is mandatory." />
        </Label>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.1"
          value={manualKm}
          onChange={(e) => setManualKm(e.target.value)}
          placeholder="e.g. 18.4"
          className="h-9 text-sm"
        />
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason / remarks (optional)"
          className="text-xs"
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground">
              Proof attachments {manualKm.trim() !== "" && <span className="text-destructive">*</span>}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3 mr-1" />}
              Attach
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {proofs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No proof attached</p>
          ) : (
            <ul className="space-y-1">
              {proofs.map((p, i) => (
                <li key={`${p.url}-${i}`} className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-primary underline underline-offset-2"
                    onClick={() => openProof(p)}
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    className="text-destructive"
                    onClick={() => setProofs((list) => list.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button size="sm" className="h-8 w-full text-xs" onClick={save} disabled={saving || uploading}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save effort details"}
        </Button>
      </div>
    </div>
  );
}
