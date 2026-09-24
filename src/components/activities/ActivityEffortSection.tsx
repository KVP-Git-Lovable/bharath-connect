import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Bike, Bus, Car as CarIcon, Gauge, HelpCircle, IndianRupee, MapPinOff, Truck, Loader2, Paperclip, RefreshCw, Route, Timer, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeTravelForCheckIn,
  explainMissingTravel,
  findOrigin,
  uploadTravelProof,
  TRAVEL_PROOF_BUCKET,
  type TravelProofEntry,
} from "@/utils/activityTravel";
import { resolveSignedUrl } from "@/utils/signedStorage";
import { useTaRates } from "@/hooks/useTaRates";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { lockedFareClaim, syncFareClaim, type FareClaimOutcome } from "@/utils/fareClaim";
import { TRAVEL_ROLE_LABEL, canEnterFare, earnsTravel, needsCompanion, rolesFor, roleOf, sharedWithFor, travelAmountFor, travelGroupFor, type TravelCompanion, type TravelRole } from "@/utils/sharedTravel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function TravelExpenseTile({ exp, km, fare, pendingVehicle, passenger = false }: {
  exp: ActivityTravelExpense; km: number | null; fare: number | null;
  /** Set when the picker holds a vehicle that has not been saved yet. */
  pendingVehicle: string | null;
  /** Rode with a colleague: this leg earns no travel allowance. */
  passenger?: boolean;
}) {
  // The amount is priced server-side from the saved vehicle, so once the
  // picker moves the old figure is no longer about this trip. Say that
  // instead of showing a number for a vehicle the rep has moved away from.
  if (pendingVehicle) {
    return (
      <div className="rounded-lg border-[1.5px] border-dashed border-amber-400 bg-amber-50/40 p-2.5 dark:bg-amber-950/10">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          <IndianRupee className="h-3 w-3" /> Travel expense
        </p>
        <p className="mt-0.5 text-sm font-semibold">Changed to {pendingVehicle}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Save to work out the amount for this vehicle.
        </p>
      </div>
    );
  }
  const vehicle = exp.vehicle_name || "No vehicle";
  const VIcon = vehicleIcon(exp.vehicle_name, exp.is_no_vehicle);
  const fixed = exp.method === "fixed";
  const ownAmount = fare != null
    ? fare
    : exp.is_no_vehicle ? 0 : fixed ? exp.rate : km != null ? Math.round(km * exp.rate * 100) / 100 : null;
  const amount = travelAmountFor({ travel_role: passenger ? "passenger" : "solo" }, ownAmount);
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
        {passenger ? (
          <p className="flex justify-between"><span className="text-muted-foreground">Travelled with a colleague</span><span className="font-semibold">paid on their activity</span></p>
        ) : fare != null ? (
          <p className="flex justify-between"><span className="text-muted-foreground">Fare paid · {vehicle}</span><span className="font-semibold">{inr(fare)}</span></p>
        ) : exp.is_no_vehicle ? (
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
  const queryClient = useQueryClient();
  const { rateFor } = useTaRates();
  const { data: expense } = useActivityTravelExpense(activity.id);
  const existingProofs = (activity.manual_distance_attachments || []) as TravelProofEntry[];

  // The vehicle is stamped from the day's pick at check-in, but a leg can
  // differ from the rest of the day — public transport to one visit, own bike
  // to the next — so it can be corrected per activity here. Changing it does
  // not touch the day's selection.
  const { vehicleTypes } = useVehicleTypes(true);
  const [vehicleId, setVehicleId] = useState<string | null>(activity.vehicle_type_id ?? null);
  useEffect(() => { setVehicleId(activity.vehicle_type_id ?? null); }, [activity.vehicle_type_id]);

  // Public transport (bus, cab): the employee paid a fare, so there is no
  // rate per km to apply. Falls back to the normal km flow when the vehicle is
  // not marked fare based, or before the 2026-09-22 migration is applied.
  const fareBased = !!vehicleTypes.find((v) => v.id === vehicleId)?.is_fare_based;
  // The RPC prices the saved vehicle. Once the picker differs, the amount on
  // screen is about the old vehicle, not this trip.
  const savedVehicleId = activity.vehicle_type_id ?? null;
  // Only public transport may use this block. The vehicle picker stays live so
  // the rep can switch to Bus or Cab, and Save stays live while a vehicle
  // change is pending, otherwise a switch back to Car could never be saved.
  const effortLocked = !fareBased;
  const pendingVehicle =
    vehicleId !== savedVehicleId
      ? vehicleTypes.find((v) => v.id === vehicleId)?.name ?? "no vehicle"
      : null;
  const [fare, setFare] = useState(
    activity.manual_fare_amount != null ? String(activity.manual_fare_amount) : ""
  );
  // Who paid for this journey. A passenger rode with a colleague, so this leg
  // earns nothing; their DA is unaffected.
  const [travelRole, setTravelRole] = useState<TravelRole>(roleOf(activity));
  useEffect(() => { setTravelRole(roleOf(activity)); }, [activity.travel_role]);
  const isPassenger = travelRole === "passenger";

  // Who else went to this destination today. A rep cannot read a colleague's
  // activities, so the database answers this through a definer function.
  const [companions, setCompanions] = useState<TravelCompanion[]>([]);
  const [companionId, setCompanionId] = useState<string | null>(activity.shared_with_activity_id ?? null);
  useEffect(() => { setCompanionId(activity.shared_with_activity_id ?? null); }, [activity.shared_with_activity_id]);
  useEffect(() => {
    if (!needsCompanion(travelRole)) return;
    let cancelled = false;
    supabase
      .rpc("find_travel_companions" as never, { _activity_id: activity.id } as never)
      .then(({ data }) => { if (!cancelled) setCompanions((data as unknown as TravelCompanion[] | null) ?? []); });
    return () => { cancelled = true; };
  }, [travelRole, activity.id]);

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

  // Self-heal once:
  //  - activities checked in before the travel fix have no travel values stored
  //  - stored values measured from the wrong checkpoint (e.g. the day check-in
  //    when an earlier activity check-out now exists in the same session) are
  //    re-measured from the correct previous checkpoint.
  const healedRef = useRef(false);
  useEffect(() => {
    if (healedRef.current) return;
    healedRef.current = true;
    if (!ownerId) return;
    if (!checkInAt) {
      if (activity.travel_time_mins == null && activity.travel_from_type == null) {
        setTravelReason("Travel is measured when the activity is checked in.");
      }
      return;
    }
    const hasStored = activity.travel_time_mins != null || activity.travel_from_type != null;
    if (!hasStored) {
      void recalculate();
      return;
    }
    void (async () => {
      try {
        const origin = await findOrigin(ownerId, activity.activity_date, activity.id, checkInAt);
        if (!origin) return;
        const sameStart =
          activity.travel_from_at != null &&
          new Date(activity.travel_from_at as string).getTime() === new Date(origin.at).getTime();
        const sameSource =
          (activity.travel_from_activity_id ?? null) === origin.activityId &&
          (activity.travel_from_type ?? null) === origin.type;
        if (sameStart && sameSource) return;
        await recalculate();
      } catch (e) {
        console.warn("[ActivityEffortSection] checkpoint check failed", e);
      }
    })();
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
    if (needsCompanion(travelRole) && !companionId) {
      toast.error("Choose the colleague you travelled with");
      setSaving(false);
      return;
    }
    // A passenger claims nothing, so a fare left over from before they were
    // marked as one must not be validated or saved.
    const fareAmount = isPassenger || fare.trim() === "" ? null : Number(fare);
    if (fareAmount != null && (!Number.isFinite(fareAmount) || fareAmount < 0)) {
      toast.error("Enter a valid fare");
      return;
    }
    // A fare is a reimbursement claim, so it needs the ticket or meter photo.
    if (fareAmount != null && proofs.length === 0) {
      toast.error("Attach the ticket, meter reading or invoice for the fare");
      return;
    }
    setSaving(true);
    try {
      // An approved fare is a settled reimbursement. Refuse the edit before
      // anything is written, rather than leaving the activity and the claim
      // disagreeing about the amount.
      const locked = await lockedFareClaim(activity.id);
      if (locked && (!fareBased || fareAmount !== locked.amount)) {
        toast.warning(
          `This fare is ${locked.reason} at ${inr(locked.amount)}. Ask an admin to reject it first if it needs changing.`,
        );
        setSaving(false);
        return;
      }

      const sharedTravelFields = {
        travel_role: travelRole,
        shared_with_activity_id: sharedWithFor(travelRole, companionId),
        travel_group_id: travelGroupFor(travelRole, activity.id, companionId),
      };
      const baseFields = {
          manual_distance_km: km,
          manual_distance_note: note.trim() || null,
          manual_distance_attachments: proofs as any,
          // Only this activity — the day's vehicle selection is left alone.
          vehicle_type_id: vehicleId,
          // Clear any fare left over from a previous vehicle or role choice.
          ...(fareBased && !isPassenger ? { manual_fare_amount: fareAmount } : { manual_fare_amount: null }),
      };

      let { error } = await supabase
        .from("activity_events")
        .update({ ...baseFields, ...sharedTravelFields })
        .eq("id", activity.id);

      // Before the shared-travel migration that column does not exist. Save
      // everything else rather than losing the rep's distance, note and proofs,
      // and say why the travel role did not stick.
      if (error && /travel_role/.test(error.message)) {
        ({ error } = await supabase.from("activity_events").update(baseFields).eq("id", activity.id));
        if (!error) toast.warning("Apply the 2026-09-24 shared travel migration to record who paid");
      }
      if (error) {
        throw /manual_fare_amount/.test(error.message)
          ? new Error("Apply the 2026-09-22 public transport migration to save fares")
          : error;
      }
      // A fare is a reimbursement claim, so mirror it into additional_expenses
      // where approve / reject and the Overview totals already live.
      let claim: FareClaimOutcome = { kind: "none" };
      try {
        claim = await syncFareClaim({
          activityId: activity.id,
          userId: activity.user_id,
          activityDate: activity.activity_date,
          fare: fareBased && !isPassenger ? fareAmount : null,
          billPath: proofs[0]?.url ?? null,
          description: `${activity.activity_code || "Activity"} · ${activity.activity_name || "travel"}`,
        });
      } catch (e: any) {
        // The effort details are already saved; say what did not follow.
        toast.error(
          /activity_id/.test(e?.message || "")
            ? "Apply the 2026-09-23 fare claim migration to send fares for approval"
            : "Saved, but the fare could not be sent for approval",
        );
      }

      // The amount is priced server-side from the activity's vehicle, so it has
      // to be re-fetched once the vehicle or fare changes.
      queryClient.invalidateQueries({ queryKey: ["activity-travel-expense", activity.id] });

      if (claim.kind === "locked") {
        toast.warning(`This fare is already approved at ${inr(claim.amount)} and cannot be changed here.`);
      } else if (claim.kind === "saved") {
        toast.success(claim.autoApproved ? "Fare auto-approved" : "Fare sent for approval");
      } else {
        toast.success("Effort details saved");
      }
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
          <TravelExpenseTile
            exp={expense}
            km={effectiveKm}
            fare={fareBased && !isPassenger && activity.manual_fare_amount != null ? Number(activity.manual_fare_amount) : null}
            passenger={isPassenger}
            pendingVehicle={pendingVehicle}
          />
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
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <CarIcon className="h-3.5 w-3.5" /> Vehicle used for this trip
            <Help text="Defaults to the vehicle you picked for the day. Change it here if this one leg was different — a bus or cab to this visit, your own vehicle to the next. Your day's vehicle is not affected." />
          </Label>
          <Select value={vehicleId ?? ""} onValueChange={(v) => setVehicleId(v || null)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="No vehicle recorded" />
            </SelectTrigger>
            <SelectContent>
              {vehicleTypes.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                  {v.is_fare_based ? " · fare" : v.is_no_vehicle ? " · no TA" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" /> Who paid for this journey
            <Help text="Travel allowance covers the cost of getting there, so it is paid once per journey. If you rode with a colleague, their activity carries it and this one earns nothing. Your daily allowance is not affected." />
          </Label>
          <Select value={travelRole} onValueChange={(v) => setTravelRole(v as TravelRole)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {rolesFor(fareBased).map((r) => (
                <SelectItem key={r} value={r}>{TRAVEL_ROLE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isPassenger && (
            <p className="text-[11px] text-muted-foreground">
              No travel allowance on this leg — it is paid on your colleague&apos;s activity. Your daily allowance is unchanged.
            </p>
          )}

          {needsCompanion(travelRole) && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Travelled with</Label>
              {companions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nobody else has an activity at this destination today. Ask them to save theirs first, then choose them here.
                </p>
              ) : (
                <Select value={companionId ?? ""} onValueChange={(v) => setCompanionId(v || null)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Choose the colleague" />
                  </SelectTrigger>
                  <SelectContent>
                    {companions.map((c) => (
                      <SelectItem key={c.activity_id} value={c.activity_id}>
                        {c.full_name}{c.activity_label ? ` · ${c.activity_label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <div
          className={effortLocked ? "space-y-2 opacity-50" : "space-y-2"}
          aria-disabled={effortLocked}
        >
        {effortLocked && (
          <p className="text-[11px] text-muted-foreground">
            Available for public transport only. Choose Bus or Cab above to enter a fare and attach the ticket.
          </p>
        )}
        {fareBased && !canEnterFare({ travel_role: travelRole }) ? (
          <p className="text-[11px] text-muted-foreground">
            Nothing to claim on this leg — your colleague is claiming the fare.
          </p>
        ) : fareBased ? (
          <>
            <Label className="flex items-center gap-1.5 text-xs">
              <IndianRupee className="h-3.5 w-3.5" /> Fare paid for this trip (₹)
              <Help text="Public transport is reimbursed at what you actually paid, not per km. Attach the ticket, meter reading or invoice below." />
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={fare}
              onChange={(e) => setFare(e.target.value)}
              placeholder="e.g. 180"
              className="h-9 text-sm"
            />
          </>
        ) : (
          <>
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
              disabled={effortLocked}
            />
          </>
        )}
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason / remarks (optional)"
          className="text-xs"
          disabled={effortLocked}
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground">
              {fareBased ? "Ticket / meter / invoice" : "Proof attachments"}{" "}
              {(fareBased ? fare.trim() !== "" : manualKm.trim() !== "") && <span className="text-destructive">*</span>}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={effortLocked || uploading}
              onClick={() => fileRef.current?.click()}
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
                    className="text-destructive disabled:opacity-40"
                    disabled={effortLocked}
                    onClick={() => setProofs((list) => list.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        </div>

        <Button
          size="sm"
          className="h-8 w-full text-xs"
          onClick={save}
          disabled={saving || uploading || (effortLocked && !pendingVehicle)}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save effort details"}
        </Button>
      </div>
    </div>
  );
}
