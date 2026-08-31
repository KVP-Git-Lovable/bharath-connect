import { useEffect, useState } from "react";
import { MapPin, CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, Route, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import type { Activity as ActivityType } from "@/hooks/useActivities";

type Coords = { lat: number; lng: number };

const CACHE_PREFIX = "geocode:v1:";

function haversineKm(a: Coords, b: Coords) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function geocode(address: string): Promise<Coords | null> {
  const key = CACHE_PREFIX + address.trim().toLowerCase();
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed && typeof parsed.lat === "number" ? parsed : null;
    }
  } catch { /* ignore */ }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
    );
    const json = await res.json();
    const hit = Array.isArray(json) && json[0];
    const coords = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    try { localStorage.setItem(key, JSON.stringify(coords)); } catch { /* ignore */ }
    return coords;
  } catch {
    return null;
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    const json = await res.json();
    return json?.display_name || null;
  } catch {
    return null;
  }
}

interface Props {
  activity: ActivityType;
  className?: string;
  /** Called after the visited location is re-captured and saved */
  onUpdated?: (patch: { location_lat: number; location_lng: number; location_address: string | null }) => void;
  /** Hide the address columns; keeps the verification badge + re-submit button. Useful for mobile card surfaces. */
  compact?: boolean;
}

export default function ActivityGeoStamp({ activity, className, onUpdated, compact }: Props) {
  const leadAddress = (activity as any).lead_address as string | undefined;
  const [override, setOverride] = useState<{ lat: number; lng: number; address: string | null } | null>(null);
  const lat = override?.lat ?? activity.location_lat ?? activity.status_change_lat;
  const lng = override?.lng ?? activity.location_lng ?? activity.status_change_lng;
  const visitedAddress = override ? override.address : activity.location_address;
  const hasVisited = !!(lat && lng) || !!visitedAddress;

  const [leadCoords, setLeadCoords] = useState<Coords | null>(null);
  const [checking, setChecking] = useState(false);
  const [recapturing, setRecapturing] = useState(false);
  const [autoTried, setAutoTried] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!leadAddress || !lat || !lng) { setLeadCoords(null); return; }
    setChecking(true);
    geocode(leadAddress).then((c) => {
      if (!alive) return;
      setLeadCoords(c);
      setChecking(false);
    });
    return () => { alive = false; };
  }, [leadAddress, lat, lng]);

  const captureAndSave = async () => {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Location is not available on this device"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });
    });
    const nLat = pos.coords.latitude;
    const nLng = pos.coords.longitude;
    const address = await reverseGeocode(nLat, nLng);

    const { error } = await supabase
      .from("activity_events")
      .update({ location_lat: nLat, location_lng: nLng, location_address: address })
      .eq("id", activity.id);
    if (error) throw error;

    setOverride({ lat: nLat, lng: nLng, address });
    onUpdated?.({ location_lat: nLat, location_lng: nLng, location_address: address });
    return address;
  };

  const handleRecapture = async () => {
    if (recapturing) return;
    setRecapturing(true);
    try {
      await captureAndSave();
      toast({ title: "Location re-submitted", description: "Verification updated with your current position." });
    } catch (e: any) {
      toast({
        title: "Could not capture location",
        description: e?.message || "Please allow location access and try again.",
        variant: "destructive",
      });
    } finally {
      setRecapturing(false);
    }
  };

  // Auto-capture the visited location once the member has checked in, so the
  // card shows a geo stamp without needing the manual re-submit button.
  const status = (activity as any).status as string | undefined;
  useEffect(() => {
    if (hasVisited || autoTried) return;
    if (status !== "in_progress" && status !== "completed") return;
    setAutoTried(true);
    setRecapturing(true);
    captureAndSave()
      .catch(() => { /* silent: user can still use the re-submit button */ })
      .finally(() => setRecapturing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVisited, autoTried, status, activity.id]);

  if (!leadAddress && !hasVisited) return null;


  const distanceKm =
    leadCoords && lat && lng ? haversineKm(leadCoords, { lat: Number(lat), lng: Number(lng) }) : null;

  let match: { icon: JSX.Element; label: string; cls: string } | null = null;
  if (distanceKm !== null) {
    if (distanceKm <= 0.5) {
      match = {
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        label: `Match (${Math.round(distanceKm * 1000)} m)`,
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    } else if (distanceKm <= 1) {
      match = {
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        label: `Partial Match (${Math.round(distanceKm * 1000)} m)`,
        cls: "bg-amber-50 text-amber-700 border-amber-200",
      };
    } else {
      match = {
        icon: <XCircle className="h-3.5 w-3.5" />,
        label: `Not Matching (${distanceKm.toFixed(1)} km)`,
        cls: "bg-red-50 text-red-700 border-red-200",
      };
    }
  }

  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;

  const travelKm = (activity as any).travel_distance_km;
  const travelMins = (activity as any).travel_time_mins;


  return (
    <div className={`rounded-lg border p-3 space-y-2 ${className || ""}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> Geo Stamp
        </p>
        {checking ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Verifying
          </span>
        ) : match ? (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${match.cls}`}>
            {match.icon}
            <span>{match.label}</span>
          </span>
        ) : leadAddress && lat && lng ? (
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Not verifiable</span>
          </span>
        ) : null}
      </div>

      {(travelKm != null || travelMins != null) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {travelKm != null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
              <Route className="h-3 w-3" />
              {Number(travelKm).toFixed(1)} km travelled
            </span>
          )}
          {travelMins != null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
              <Clock className="h-3 w-3" />
              {Number(travelMins)} min travel time
            </span>
          )}
        </div>
      )}

      {compact && (
        <div className="flex items-start gap-1.5 text-[11px]">
          <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
          {recapturing && !visitedAddress ? (
            <span className="text-muted-foreground">Capturing visited location…</span>
          ) : mapsUrl ? (
            <button
              type="button"
              className="text-sky-600 dark:text-sky-400 underline underline-offset-2 text-left line-clamp-2 break-words"
              onClick={(e) => { e.stopPropagation(); window.open(mapsUrl, "_blank", "noopener,noreferrer"); }}
            >
              {visitedAddress || `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`}
            </button>
          ) : (
            <span className="text-muted-foreground">Visited location not captured</span>
          )}
        </div>
      )}

      {(distanceKm === null || distanceKm > 0.5) && (

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void handleRecapture(); }}
          disabled={recapturing}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 text-sky-700 px-2 py-1.5 text-[11px] font-medium hover:bg-sky-100 disabled:opacity-60"
        >
          {recapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {recapturing ? "Capturing your current location…" : "Re-submit visited location"}
        </button>
      )}

      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Address in Lead</p>
            <p className="text-xs text-foreground/90 break-words mt-0.5">
              {leadAddress || "No address on the lead record"}
            </p>
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Visited Address</p>
            {mapsUrl ? (
              <button
                type="button"
                className="text-xs text-sky-600 dark:text-sky-400 underline underline-offset-2 text-left break-words mt-0.5"
                onClick={(e) => { e.stopPropagation(); window.open(mapsUrl, "_blank", "noopener,noreferrer"); }}
              >
              {visitedAddress || "View location"}
              </button>
            ) : (
              <p className="text-xs text-foreground/90 break-words mt-0.5">
                {visitedAddress || "Not captured"}
              </p>
            )}
            {lat && lng && (
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
