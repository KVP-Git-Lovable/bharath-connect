import { supabase } from "@/integrations/supabase/client";
import { haversineMeters } from "@/utils/gpsDistance";

interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SnappedRoute {
  /** Path to draw (road-snapped when `snapped` is true, raw track otherwise). */
  path: LatLng[];
  /** Actual road distance in metres, or null when snapping was unavailable. */
  distanceMeters: number | null;
  snapped: boolean;
  /** Metres contributed by bridging tracking blackouts (estimated, not recorded). */
  bridgedMeters?: number;
}

/**
 * Distance engine for Day Tracking.
 *
 * Raw breadcrumbs are snapped onto real road geometry with the Google Roads API
 * (`snapToRoads`, interpolate=true) and the distance is measured ALONG that
 * geometry — the same question Google Maps Timeline answers ("which roads did
 * this phone actually cover"). The Routes API is used only to bridge tracking
 * gaps, where we genuinely have to guess the path between two known positions.
 *
 * Falls back to the raw straight-line track whenever Google is unavailable.
 */

// Roads API accepts up to 100 points per request.
const SNAP_BATCH = 100;
// Beyond these thresholds the trail has a hole in it: bridge with a driving
// route instead of pretending the breadcrumbs are continuous.
const GAP_MINUTES = 3;
const GAP_METERS = 500;
// Safety cap on outbound calls for a very dense day.
const MAX_CALLS = 60;

/**
 * Circuit breaker: when the edge runtime is degraded (503
 * SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED) every call fails the same way. After
 * a couple of failures we stop calling for a cool-off window and silently use
 * the raw GPS track instead of hammering the gateway.
 */
const BREAKER_THRESHOLD = 2;
const BREAKER_COOLDOWN_MS = 60_000;
let breakerFailures = 0;
let breakerOpenedAt = 0;

function routingUnavailable(): boolean {
  if (breakerFailures < BREAKER_THRESHOLD) return false;
  if (Date.now() - breakerOpenedAt > BREAKER_COOLDOWN_MS) {
    breakerFailures = 0;
    return false;
  }
  return true;
}

function noteRoutingFailure() {
  breakerFailures++;
  if (breakerFailures === BREAKER_THRESHOLD) breakerOpenedAt = Date.now();
}

function noteRoutingSuccess() {
  breakerFailures = 0;
}


function legMeters(points: RoutePoint[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    m += haversineMeters(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }
  return m;
}

const toLatLng = (p: RoutePoint): LatLng => ({ lat: p.latitude, lng: p.longitude });

/** Split the track wherever tracking clearly dropped out. */
function splitSegments(points: RoutePoint[]): RoutePoint[][] {
  const segments: RoutePoint[][] = [];
  let current: RoutePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (current.length === 0) {
      current.push(p);
      continue;
    }
    const prev = current[current.length - 1];
    const distM = haversineMeters(prev.latitude, prev.longitude, p.latitude, p.longitude);
    const gapMin =
      prev.timestamp && p.timestamp
        ? (new Date(p.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 60000
        : 0;
    if (gapMin > GAP_MINUTES || distM > GAP_METERS) {
      segments.push(current);
      current = [p];
    } else {
      current.push(p);
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

async function snapBatch(batch: RoutePoint[]): Promise<{ path: LatLng[]; meters: number; snapped: boolean }> {
  const raw = batch.map(toLatLng);
  if (routingUnavailable()) return { path: raw, meters: legMeters(batch), snapped: false };
  try {
    const { data, error } = await supabase.functions.invoke("snap-roads", { body: { points: raw } });
    if (error) throw error;
    const path = (data?.path ?? []) as LatLng[];
    const meters = Number(data?.distanceMeters);
    if (path.length < 2 || !Number.isFinite(meters)) throw new Error("empty snap");
    noteRoutingSuccess();
    return { path, meters, snapped: data?.snapped === true };
  } catch (e) {
    noteRoutingFailure();
    console.warn("snap-roads batch failed, using raw track", e);
    return { path: raw, meters: legMeters(batch), snapped: false };
  }
}


// Sanity guards for bridging a blackout: beyond these the two fixes are not a
// plausible single road journey (flight, stale fix, day rollover) — skip them.
const MAX_BRIDGE_METERS = 200_000;
const MAX_BRIDGE_SPEED_KMH = 120;

function isBridgeable(a: RoutePoint, b: RoutePoint): boolean {
  const straight = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  if (straight > MAX_BRIDGE_METERS) return false;
  if (a.timestamp && b.timestamp) {
    const hours = (new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) / 3600000;
    if (hours > 0 && straight / 1000 / hours > MAX_BRIDGE_SPEED_KMH) return false;
  }
  return true;
}

/** Bridge a tracking gap with a real driving route between the two ends. */
async function bridgeGap(a: RoutePoint, b: RoutePoint): Promise<{ path: LatLng[]; meters: number; snapped: boolean }> {
  const straight = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  if (straight < 50) return { path: [toLatLng(b)], meters: straight, snapped: true };
  if (routingUnavailable()) return { path: [toLatLng(b)], meters: straight, snapped: false };
  try {
    const { data, error } = await supabase.functions.invoke("snap-gps-route", {
      body: { points: [toLatLng(a), toLatLng(b)] },
    });
    if (error) throw error;
    const encoded = data?.polyline as string | null;
    const meters = Number(data?.distanceMeters);
    const path = encoded ? decodePolyline(encoded) : [];
    if (path.length < 2 || !Number.isFinite(meters)) throw new Error("empty bridge");
    noteRoutingSuccess();
    return { path, meters, snapped: true };
  } catch (e) {
    noteRoutingFailure();
    console.warn("gap bridge failed, using straight line", e);
    return { path: [toLatLng(b)], meters: straight, snapped: false };

  }
}

export async function getSnappedRoute(points: RoutePoint[]): Promise<SnappedRoute> {
  if (points.length < 2) return { path: [], distanceMeters: null, snapped: false };

  const segments = splitSegments(points);
  let calls = 0;
  const path: LatLng[] = [];
  let meters = 0;
  let bridgedMeters = 0;
  let allSnapped = true;

  try {
    for (let s = 0; s < segments.length; s++) {
      const segment = segments[s];

      if (s > 0) {
        // Bridge the hole between the previous segment and this one.
        const prevSeg = segments[s - 1];
        const from = prevSeg[prevSeg.length - 1];
        const to = segment[0];
        if (!isBridgeable(from, to)) {
          // Implausible as a road journey — keep the line broken and add nothing.
          path.push(toLatLng(to));
          allSnapped = false;
        } else if (calls < MAX_CALLS) {
          calls++;
          const bridge = await bridgeGap(from, to);
          path.push(...bridge.path);
          meters += bridge.meters;
          bridgedMeters += bridge.meters;
          if (!bridge.snapped) allSnapped = false;
        } else {
          const straight = haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude);
          meters += straight;
          bridgedMeters += straight;
          path.push(toLatLng(to));
          allSnapped = false;
        }
      }


      if (segment.length < 2) {
        path.push(toLatLng(segment[0]));
        continue;
      }

      // Snap the segment in overlapping batches so no distance is lost at seams.
      for (let i = 0; i < segment.length - 1; i += SNAP_BATCH - 1) {
        const batch = segment.slice(i, i + SNAP_BATCH);
        if (batch.length < 2) break;
        if (calls >= MAX_CALLS) {
          path.push(...batch.map(toLatLng));
          meters += legMeters(batch);
          allSnapped = false;
          continue;
        }
        calls++;
        const res = await snapBatch(batch);
        path.push(...res.path);
        meters += res.meters;
        if (!res.snapped) allSnapped = false;
      }
    }

    if (path.length < 2) throw new Error("empty route");
    return { path, distanceMeters: meters > 0 ? meters : null, snapped: allSnapped, bridgedMeters };
  } catch {
    return {
      path: points.map(toLatLng),
      distanceMeters: null,
      snapped: false,
    };
  }
}

/** Decode a Google encoded polyline into lat/lng pairs. */
export function decodePolyline(encoded: string): LatLng[] {
  const path: LatLng[] = [];
  let index = 0,
    lat = 0,
    lng = 0;

  while (index < encoded.length) {
    let result = 0,
      shift = 0,
      b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    path.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return path;
}
