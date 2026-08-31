import { supabase } from "@/integrations/supabase/client";
import { haversineMeters } from "@/utils/gpsDistance";

export interface TravelComputation {
  travel_distance_km: number | null;
  travel_time_mins: number | null;
  travel_from_type: "attendance" | "activity" | null;
  travel_from_activity_id: string | null;
  travel_from_at: string | null;
}

interface Origin {
  lat: number;
  lng: number;
  at: string;
  type: "attendance" | "activity";
  activityId: string | null;
}

/** Pull the check-out coordinates recorded for an activity (status history first). */
function checkOutPoint(row: any): { lat: number; lng: number } | null {
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
    .limit(5);

  for (const row of prev || []) {
    const pt = checkOutPoint(row);
    if (pt) {
      return { lat: pt.lat, lng: pt.lng, at: row.end_time as string, type: "activity", activityId: row.id as string };
    }
  }

  const { data: att } = await supabase
    .from("attendance")
    .select("check_in_time, check_in_location")
    .eq("user_id", userId)
    .eq("date", dateStr)
    .maybeSingle();

  const loc = att?.check_in_location as any;
  if (att?.check_in_time && loc?.latitude && loc?.longitude) {
    return {
      lat: Number(loc.latitude),
      lng: Number(loc.longitude),
      at: att.check_in_time as string,
      type: "attendance",
      activityId: null,
    };
  }
  return null;
}

/** Road distance in km via the existing Routes bridge; falls back to straight line. */
async function roadDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<number> {
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

/**
 * Distance + time travelled to reach this activity's customer, measured from the
 * previous activity's check-out (or the day's attendance check-in for the first one).
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
  if (lat == null || lng == null) return null;

  const origin = await findOrigin(userId, activityDate, activityId, checkInAt);
  if (!origin) return null;

  const km = await roadDistanceKm({ lat: origin.lat, lng: origin.lng }, { lat: Number(lat), lng: Number(lng) });
  const mins = Math.max(
    0,
    Math.round((new Date(checkInAt).getTime() - new Date(origin.at).getTime()) / 60000)
  );

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
