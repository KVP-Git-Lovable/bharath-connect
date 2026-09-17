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

/** Local calendar date (device time zone) of an ISO timestamp. */
function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The moment an activity was actually checked out: the last "completed" transition, else its end time. */
export function checkOutAt(row: any): string | null {
  const history = Array.isArray(row?.status_history) ? row.status_history : [];
  const completed = [...history].reverse().find((h: any) => h?.status === "completed" && h?.at);
  return (completed?.at as string | undefined) ?? (row?.end_time as string | null) ?? null;
}

/**
 * Pick the previous checkpoint for a check-in: the latest check-out that happened
 * inside the current attendance session (at or after the session start) and before
 * this check-in. Returns null when there is none (then the attendance check-in is the start).
 */
export function pickPreviousCheckout<T>(rows: T[], checkInAt: string, sessionStart: string | null): { row: T; at: string } | null {
  const inMs = new Date(checkInAt).getTime();
  const startMs = sessionStart ? new Date(sessionStart).getTime() : -Infinity;
  let best: { row: T; at: string; ms: number } | null = null;
  for (const row of rows) {
    const at = checkOutAt(row);
    if (!at) continue;
    const ms = new Date(at).getTime();
    if (!Number.isFinite(ms) || ms >= inMs || ms < startMs) continue;
    if (!best || ms > best.ms) best = { row, at, ms };
  }
  return best ? { row: best.row, at: best.at } : null;
}

/**
 * Find where this journey started — every activity is a checkpoint:
 *  - the previous activity's check-out within the same attendance session
 *  - otherwise the attendance check-in (i.e. the first activity of the session)
 * Only the start TIME is required. Coordinates are attached when available.
 */
async function findOrigin(
  userId: string,
  dateStr: string,
  currentActivityId: string,
  checkInAt: string
): Promise<Origin | null> {
  // The attendance session this check-in belongs to: the day it actually happened
  // (falls back to the activity's own date).
  const checkInDay = localDate(checkInAt);
  const loadAttendance = async (day: string) => {
    const { data } = await supabase
      .from("attendance")
      .select("check_in_time, check_in_location")
      .eq("user_id", userId)
      .eq("date", day)
      .maybeSingle();
    return data as { check_in_time: string | null; check_in_location: any } | null;
  };
  let att = await loadAttendance(checkInDay);
  if (!att?.check_in_time && dateStr && dateStr !== checkInDay) att = await loadAttendance(dateStr);
  const sessionStart =
    att?.check_in_time && new Date(att.check_in_time).getTime() <= new Date(checkInAt).getTime()
      ? att.check_in_time
      : null;

  // Previous check-outs: inside the session window when there is one,
  // otherwise (no attendance) the activity's own date as before.
  let query = supabase
    .from("activity_events")
    .select("id, end_time, status_history, status_change_lat, status_change_lng, location_lat, location_lng")
    .eq("user_id", userId)
    .neq("id", currentActivityId)
    .not("end_time", "is", null);
  if (sessionStart) {
    // end_time can be edited by hand, so widen the window and decide on the real check-out moment below.
    const from = new Date(new Date(sessionStart).getTime() - 12 * 3600_000).toISOString();
    const to = new Date(new Date(checkInAt).getTime() + 12 * 3600_000).toISOString();
    query = query.gte("end_time", from).lte("end_time", to);
  } else {
    query = query.eq("activity_date", dateStr);
  }
  const { data: prev } = await query.order("end_time", { ascending: false }).limit(100);

  const picked = pickPreviousCheckout((prev || []) as any[], checkInAt, sessionStart);
  if (picked) {
    const pt = checkOutPoint(picked.row);
    return {
      lat: pt?.lat ?? null,
      lng: pt?.lng ?? null,
      at: picked.at,
      type: "activity",
      activityId: picked.row.id as string,
    };
  }

  if (sessionStart) {
    const pt = readLatLng(att?.check_in_location);
    return {
      lat: pt?.lat ?? null,
      lng: pt?.lng ?? null,
      at: sessionStart,
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

/**
 * Plain-language reason why travel could not be measured for an activity,
 * shown in the Effort section instead of a silent blank.
 */
export async function explainMissingTravel(params: {
  userId: string;
  activityDate: string;
  checkInAt: string | null;
}): Promise<string> {
  const { userId, activityDate, checkInAt } = params;
  if (!checkInAt) return "Travel is measured when the activity is checked in.";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  // Same session rule as the calculation: the day the check-in happened, else the activity's date.
  const day = localDate(checkInAt);
  let { data: att, error } = await supabase
    .from("attendance")
    .select("check_in_time")
    .eq("user_id", userId)
    .eq("date", day)
    .maybeSingle();
  if (!error && !att?.check_in_time && activityDate !== day) {
    ({ data: att, error } = await supabase
      .from("attendance")
      .select("check_in_time")
      .eq("user_id", userId)
      .eq("date", activityDate)
      .maybeSingle());
  }
  if (error) return "Could not read the day check-in for this activity's owner.";
  if (!att?.check_in_time) {
    return "No day check-in was recorded on this date, so there is no starting point. Start the day before checking in to an activity.";
  }
  if (new Date(att.check_in_time).getTime() > new Date(checkInAt).getTime()) {
    return `The day check-in (${fmt(att.check_in_time)}) happened after this activity check-in (${fmt(checkInAt)}), so there is no starting point.`;
  }
  return "Travel could not be calculated. Tap Recalculate to try again.";
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
