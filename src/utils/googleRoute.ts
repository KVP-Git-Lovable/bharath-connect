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

/** How the final distance number was produced. Labels shown to the user must
 *  match this — never claim "road-snapped" for a fallback calculation. */
export type DistanceSource = "road-snapped" | "validated-gps" | "estimated-gap" | "mixed";

export interface SnappedRoute {
  /** Path to draw (road-snapped where snapping succeeded, validated track otherwise). */
  path: LatLng[];
  /** Total metres (tracked + estimated), or null when routing was unavailable. */
  distanceMeters: number | null;
  /** GPS-confirmed metres: measured along observed (snapped or validated) trail. */
  trackedMeters: number;
  /** Estimated metres: reconstructed across tracking blackouts. NEVER
   *  reclassified as GPS-confirmed — the road taken during a gap is a guess. */
  estimatedMeters: number;
  /** Back-compat alias of estimatedMeters (amber "bridged km" label). */
  bridgedMeters: number;
  /** True only when every snap batch genuinely road-snapped. */
  snappingComplete: boolean;
  /** True when any stretch fell back to validated-GPS measurement
   *  (circuit breaker, API failure, or the MAX_CALLS cap). */
  snappingFallbackUsed: boolean;
  source: DistanceSource;
  /** Back-compat: true ⇔ snappingComplete. */
  snapped: boolean;
}

/**
 * Distance engine for Day Tracking.
 *
 * Validated trajectory SEGMENTS (from gpsDistance.processTrajectory — the
 * single segmentation authority) are snapped onto real road geometry with the
 * Google Roads API (`snapToRoads`, interpolate=true) and the distance is
 * measured ALONG that geometry. Segment boundaries are tracking blackouts;
 * the Routes API bridges them and those metres are classified ESTIMATED,
 * kept separate from GPS-confirmed (tracked) metres end-to-end.
 *
 * Falls back to the validated straight-line track whenever Google is
 * unavailable — never to raw unfiltered GPS.
 */

// Roads API accepts up to 100 points per request.
const SNAP_BATCH = 100;
// Safety cap on outbound calls for a very dense day.
const MAX_CALLS = 60;

/**
 * Circuit breaker: when the edge runtime is degraded (503
 * SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED) every call fails the same way. After
 * a couple of failures we stop calling for a cool-off window and silently use
 * the validated GPS track instead of hammering the gateway.
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
      points[i - 1]!.latitude,
      points[i - 1]!.longitude,
      points[i]!.latitude,
      points[i]!.longitude
    );
  }
  return m;
}

const toLatLng = (p: RoutePoint): LatLng => ({ lat: p.latitude, lng: p.longitude });

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
    console.warn("snap-roads batch failed, using validated track", e);
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

/**
 * Snap validated trajectory segments to roads and measure the distance.
 *
 * @param segments Chronological validated segments from
 *   gpsDistance.processTrajectory; the holes BETWEEN segments are tracking
 *   gaps, bridged here and classified as estimated distance.
 */
export async function getSnappedRoute(segments: RoutePoint[][]): Promise<SnappedRoute> {
  const nonEmpty = segments.filter((s) => s.length > 0);
  const totalPoints = nonEmpty.reduce((n, s) => n + s.length, 0);
  const failure = (): SnappedRoute => ({
    path: nonEmpty.flat().map(toLatLng),
    distanceMeters: null,
    trackedMeters: 0,
    estimatedMeters: 0,
    bridgedMeters: 0,
    snappingComplete: false,
    snappingFallbackUsed: true,
    source: "validated-gps",
    snapped: false,
  });
  if (totalPoints < 2) {
    return { ...failure(), path: [], snappingFallbackUsed: false };
  }

  let calls = 0;
  const path: LatLng[] = [];
  let trackedMeters = 0;
  let estimatedMeters = 0;
  let snappingFallbackUsed = false;
  let allSnapped = true;

  try {
    for (let s = 0; s < nonEmpty.length; s++) {
      const segment = nonEmpty[s];

      if (s > 0) {
        // Bridge the hole between the previous segment and this one.
        const prevSeg = nonEmpty[s - 1];
        const from = prevSeg![prevSeg!.length - 1];
        const to = segment![0];
        if (!isBridgeable(from!, to!)) {
          // Implausible as a road journey — keep the line broken and add nothing.
          path.push(toLatLng(to!));
          allSnapped = false;
        } else if (calls < MAX_CALLS) {
          calls++;
          const bridge = await bridgeGap(from!, to!);
          path.push(...bridge.path);
          estimatedMeters += bridge.meters;
          if (!bridge.snapped) allSnapped = false;
        } else {
          const straight = haversineMeters(from!.latitude, from!.longitude, to!.latitude, to!.longitude);
          estimatedMeters += straight;
          path.push(toLatLng(to!));
          allSnapped = false;
        }
      }

      if (segment!.length < 2) {
        path.push(toLatLng(segment![0]!));
        continue;
      }

      // Snap the segment in overlapping batches (stride SNAP_BATCH-1) so the
      // seam leg is measured exactly once; drop the duplicated seam vertex
      // from the drawn path.
      let firstBatch = true;
      for (let i = 0; i < segment!.length - 1; i += SNAP_BATCH - 1) {
        const batch = segment!.slice(i, i + SNAP_BATCH);
        if (batch.length < 2) break;
        if (calls >= MAX_CALLS) {
          path.push(...batch.slice(firstBatch ? 0 : 1).map(toLatLng));
          trackedMeters += legMeters(batch);
          snappingFallbackUsed = true;
          allSnapped = false;
          firstBatch = false;
          continue;
        }
        calls++;
        const res = await snapBatch(batch);
        path.push(...(firstBatch ? res.path : res.path.slice(1)));
        trackedMeters += res.meters;
        if (!res.snapped) {
          snappingFallbackUsed = true;
          allSnapped = false;
        }
        firstBatch = false;
      }
    }

    if (path.length < 2) throw new Error("empty route");

    const meters = trackedMeters + estimatedMeters;
    const snappingComplete = allSnapped && !snappingFallbackUsed;
    let source: DistanceSource;
    if (trackedMeters === 0 && estimatedMeters > 0) source = "estimated-gap";
    else if (snappingComplete && estimatedMeters === 0) source = "road-snapped";
    else if (!snappingComplete || estimatedMeters > 0) source = "mixed";
    else source = "road-snapped";

    return {
      path,
      distanceMeters: meters > 0 ? meters : null,
      trackedMeters,
      estimatedMeters,
      bridgedMeters: estimatedMeters,
      snappingComplete,
      snappingFallbackUsed,
      source,
      snapped: snappingComplete,
    };
  } catch {
    return failure();
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
