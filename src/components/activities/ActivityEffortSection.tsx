import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Gauge, HelpCircle, IndianRupee, Loader2, Paperclip, Route, Timer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadTravelProof, TRAVEL_PROOF_BUCKET, type TravelProofEntry } from "@/utils/activityTravel";
import { resolveSignedUrl } from "@/utils/signedStorage";
import { useTaRates } from "@/hooks/useTaRates";
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
  const existingProofs = (activity.manual_distance_attachments || []) as TravelProofEntry[];

  const [manualKm, setManualKm] = useState(
    activity.manual_distance_km != null ? String(activity.manual_distance_km) : ""
  );
  const [note, setNote] = useState(activity.manual_distance_note || "");
  const [proofs, setProofs] = useState<TravelProofEntry[]>(existingProofs);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const meetingMins =
    activity.start_time && activity.end_time
      ? Math.max(0, Math.round((new Date(activity.end_time).getTime() - new Date(activity.start_time).getTime()) / 60000))
      : null;

  const prevLabel =
    activity.travel_from_type === "attendance"
      ? "Attendance (day check-in)"
      : activity.travel_from_activity_id
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
    activity.manual_distance_km != null
      ? Number(activity.manual_distance_km)
      : activity.travel_distance_km != null
        ? Number(activity.travel_distance_km)
        : null;
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
          value={activity.travel_distance_km != null ? `${activity.travel_distance_km} km` : "—"}
        />
        <Field
          icon={<Timer className="h-3 w-3" />}
          label="Travel time"
          help="From the previous activity"
          value={activity.travel_time_mins != null ? `${activity.travel_time_mins} min` : "—"}
        />
        <Field
          icon={<Timer className="h-3 w-3" />}
          label="Meeting time"
          help="Time spent with the customer (check-out time − check-in time)"
          value={meetingMins != null ? `${meetingMins} min` : "—"}
        />
        <Field
          icon={<IndianRupee className="h-3 w-3" />}
          label="Travel expense"
          help={`Distance × the per KM rate effective on this activity's date (₹${perKmRate}/km)`}
          value={travelCost != null ? `₹${travelCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
        />
        <div className="col-span-2 rounded-lg border bg-muted/30 p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Previous activity considered
            <Help text="The record used as the starting point for the travel calculation" />
          </p>
          {activity.travel_from_activity_id ? (
            <button
              type="button"
              className="mt-0.5 block text-left text-sm font-semibold text-primary underline underline-offset-2"
              onClick={() => {
                onNavigateAway?.();
                navigate(`/activities?id=${activity.travel_from_activity_id}`);
              }}
            >
              {prevLabel}
            </button>
          ) : (
            <p className="mt-0.5 text-sm font-semibold">{prevLabel}</p>
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
