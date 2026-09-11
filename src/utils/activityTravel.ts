import { supabase } from "@/integrations/supabase/client";
import { haversineMeters, processTrajectory, type TrackPoint } from "@/utils/gpsDistance";

export interface TravelComputation {
  travel_distance_km: number | null;
  travel_time_mins: number | null;
  travel_from_type: "attendance" | "activity" | null;
  travel_from_activity_id: string | null;
  travel_from_at: string | null;
}

interface Origin {
  /** Coordinates are optional: travel time and the GPS-trail distance only need the time. */
  lat: number | null;
  lng: number | null;
  at: string;
  type: "attendance" | "activity";
  activityId: string | null;
}

type LatLng = { lat: number; lng: number };

/** Accept both stored shapes: {latitude, longitude} (Attendance page) and {lat, lng} (day check-in from Activities). */
function readLatLng(loc: any): LatLng | null {
  if (!loc || typeof loc !== "object") return null;
  const lat = Number(loc.latitude ?? loc.lat);
  const lng = Number(loc.longitude ?? loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

/** Pull the check-out coordinates recorded for an activity (status history first). */
function checkOutPoint(row: any): LatLng | null {
  const history = Array.isArray(row?.status_history) ? row.status_history : [];
  const completed = [...history].reverse().find((h: any) => h?.status === "completed" && h?.lat && h?.lng);
  if (completed) return { lat: Number(completed.lat), lng: Number(completed.lng) };
  if (row?.status_change_lat && row?.status_change_lng) {
    return { lat: Number(row.status_change_lat), lng: Number(row.status_change_lng) };
  }
  if (row?.location_lat && row?.location_lng) {
    return { lat: Number(row.location_lat), lng: Number(row.location_lng) };
  }
  return null;
}

/**
 * Find where this journey started:
 *  - the most recent activity of the same user/day that was checked out before now
 *  - otherwise the day's attendance check-in (i.e. the first activity of the day)
 * Only the start TIME is required. Coordinates are attached when available.
 */
async function findOrigin(
  userId: string,
  dateStr: string,
  currentActivityId: string,
  checkInAt: string
): Promise<Origin | null> {
  const { data: prev } = await supabase
    .from("activity_events")
    .select("id, end_time, status_history, status_change_lat, status_change_lng, location_lat, location_lng")
    .eq("user_id", userId)
    .eq("activity_date", dateStr)
    .neq("id", currentActivityId)
    .not("end_time", "is", null)
    .lt("end_time", checkInAt)
    .order("end_time", { ascending: false })
    .limit(1);

  const last = prev?.[0];
  if (last?.end_time) {
    const pt = checkOutPoint(last);
    return {
      lat: pt?.lat ?? null,
      lng: pt?.lng ?? null,
      at: last.end_time as string,
      type: "activity",
      activityId: last.id as string,
    };
  }

  const { data: att } = await supabase
    .from("attendance")
    .select("check_in_time, check_in_location")
    .eq("user_id", userId)
    .eq("date", dateStr)
    .maybeSingle();

  if (att?.check_in_time && new Date(att.check_in_time as string).getTime() <= new Date(checkInAt).getTime()) {
    const pt = readLatLng(att.check_in_location);
    return {
      lat: pt?.lat ?? null,
      lng: pt?.lng ?? null,
      at: att.check_in_time as string,
      type: "attendance",
      activityId: null,
    };
  }
  return null;
}

/** Road distance in km via the existing Routes bridge; falls back to straight line. */
async function roadDistanceKm(a: LatLng, b: LatLng): Promise<number> {
  const straightKm = haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
  if (straightKm < 0.05) return Math.round(straightKm * 100) / 100;
  try {
    const { data, error } = await supabase.functions.invoke("snap-gps-route", { body: { points: [a, b] } });
    if (error) throw error;
    const meters = Number(data?.distanceMeters);
    if (Number.isFinite(meters) && meters > 0) return Math.round((meters / 1000) * 100) / 100;
  } catch {
    /* fall back to straight line */
  }
  return Math.round(straightKm * 100) / 100;
}

/** Recorded GPS points for the user between two moments (by timestamp only). */
async function loadTrail(userId: string, fromIso: string, toIso: string): Promise<TrackPoint[]> {
  // No filter on the `date` column: some trackers stamp it in UTC and others in
  // local time, so early-morning IST points can carry the previous date. The
  // timestamp window is the reliable key.
  const { data, error } = await supabase
    .from("gps_tracking")
    .select("latitude, longitude, timestamp, accuracy, speed, heading")
    .eq("user_id", userId)
    .gte("timestamp", fromIso)
    .lte("timestamp", toIso)
    .order("timestamp", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    timestamp: r.timestamp as string,
    accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    speed: r.speed != null ? Number(r.speed) : null,
    heading: r.heading != null ? Number(r.heading) : null,
  }));
}

/**
 * Distance actually travelled along the recorded GPS trail.
 * Uses the same trajectory engine as Day Tracking so both surfaces agree.
 * Returns null when the trail is too sparse to trust.
 */
function trailDistanceKm(points: TrackPoint[]): number | null {
  if (points.length < 3) return null;
  const result = processTrajectory(points);
  if (result.points.length < 3) return null;
  const km = Math.round(result.trackedDistanceKm * 100) / 100;
  return km > 0 ? km : null;
}

/**
 * Distance + time travelled to reach this activity's customer, measured from the
 * previous activity's check-out (or the day's attendance check-in for the first one).
 *
 * Travel time needs only the two timestamps, so it is always returned when a
 * journey start exists. Distance prefers the GPS trail; falls back to the road
 * distance between the two check-in points; stays null only when neither exists.
 */
export async function computeTravelForCheckIn(params: {
  userId: string;
  activityId: string;
  activityDate: string;
  checkInAt: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<TravelComputation | null> {
  const { userId, activityId, activityDate, checkInAt, lat, lng } = params;
  if (!userId || !activityDate || !checkInAt) return null;

  const origin = await findOrigin(userId, activityDate, activityId, checkInAt);
  if (!origin) return null;

  const mins = Math.max(
    0,
    Math.round((new Date(checkInAt).getTime() - new Date(origin.at).getTime()) / 60000)
  );

  let trail: TrackPoint[] = [];
  try {
    trail = await loadTrail(userId, origin.at, checkInAt);
  } catch (e) {
    console.warn("[activityTravel] could not load GPS trail", e);
  }

  let km: number | null = trailDistanceKm(trail);

  if (km == null) {
    // Fallback: road distance between the journey start and this check-in.
    // Missing ends are filled from the first/last recorded GPS point.
    const first = trail[0];
    const lastPt = trail[trail.length - 1];
    const from: LatLng | null =
      origin.lat != null && origin.lng != null
        ? { lat: origin.lat, lng: origin.lng }
        : first
          ? { lat: first.latitude, lng: first.longitude }
          : null;
    const to: LatLng | null =
      lat != null && lng != null
        ? { lat: Number(lat), lng: Number(lng) }
        : lastPt
          ? { lat: lastPt.latitude, lng: lastPt.longitude }
          : null;
    if (from && to) km = await roadDistanceKm(from, to);
  }

  if (km == null) {
    console.warn("[activityTravel] no coordinates or GPS trail for distance", {
      origin: origin.type,
      from: origin.at,
      to: checkInAt,
      trailPoints: trail.length,
    });
  }

  return {
    travel_distance_km: km,
    travel_time_mins: mins,
    travel_from_type: origin.type,
    travel_from_activity_id: origin.activityId,
    travel_from_at: origin.at,
  };
}

const PROOF_BUCKET = "activity-photos";

export interface TravelProofEntry {
  url: string;
  name: string;
  at: string;
}

export async function uploadTravelProof(file: File): Promise<TravelProofEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const ext = file.name.split(".").pop() || "bin";
  const path = `${user.id}/travel-proof/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  return { url: path, name: file.name, at: new Date().toISOString() };
}

export const TRAVEL_PROOF_BUCKET = PROOF_BUCKET;
