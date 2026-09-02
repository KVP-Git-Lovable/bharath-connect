import { haversineMeters as haversineMetersLatLng, GPS_PROCESSING_CONFIG } from "@/utils/gpsDistance";

export interface GateFix {
  lat: number;
  lng: number;
  ts: number;
  accuracy: number | null;
}

// Thresholds come from the shared engine config so capture-side gating can
// never drift from the display-side algorithm. This gate only throttles
// capture-side writes; gpsDistance.ts is the authoritative arbiter of
// counted distance for display.
const MIN_MOVE_METERS_FLOOR = GPS_PROCESSING_CONFIG.DUPLICATE_EPSILON_METERS;
const MAX_ACCURACY_M = GPS_PROCESSING_CONFIG.MAX_ACCURACY_METERS; // worst-case fallback for null accuracy

/**
 * Capture-side acquisition + synchronization configuration (battery policy).
 * Single home for these values — no magic numbers at call sites.
 *
 * MOVING: the native watcher's LocationRequest. `maxWaitMs > intervalMs`
 * enables fused-location batched delivery so the radio can duty-cycle.
 * The interval/fastest/maxWait keys need the patched
 * @capacitor-community/background-geolocation (see patches/); an unpatched
 * build ignores them and falls back to the plugin's 1 Hz default —
 * degraded battery, identical data.
 *
 * QUEUE: local GPS buffer + batched upload policy (see gpsSyncQueue.ts).
 */
export const GPS_CAPTURE_CONFIG = {
  MOVING: {
    distanceFilter: 5, // metres; OS-level delivery filter (unchanged from before)
    intervalMs: 3000,
    fastestIntervalMs: 2000,
    maxWaitMs: 8000,
  },
  /** No watcher callback for this long while the day is open ⇒ health probe. */
  WATCHDOG_MS: 5 * 60_000,
  /** Cadence of the watchdog check (holds NO GPS acquisition of its own). */
  WATCHDOG_TICK_MS: 60_000,
  /**
   * Stationary trail density: no watcher callback for this long while the day
   * is open ⇒ take ONE high-accuracy probe fix so a parked/stationary device
   * still leaves a trail. This is not a poll — it only fires during silence.
   */
  STATIONARY_PROBE_MS: 2 * 60_000,
  /**
   * Probe fixes worse than this are discarded instead of written: a coarse
   * network fix (typically 35 m) would otherwise become the anchor and push
   * the movement threshold to ~70 m, collapsing the whole day to 0 km.
   */
  PROBE_MAX_ACCURACY_M: 50,

  QUEUE: {
    BATCH_SIZE: 20, // flush when this many points are pending
    FLUSH_INTERVAL_MS: 60_000, // ...or at most this long between flushes
    /** Freshness path: flush a lone point if nothing has been sent recently. */
    IDLE_FLUSH_MS: 20_000,
    RETRY_BASE_MS: 15_000, // backoff: min(BASE * 2^failures, MAX)
    MAX_BACKOFF_MS: 5 * 60_000,
    CHUNK_SIZE: 100, // rows per upsert request
    MAX_POINTS: 10_000, // hard queue cap (multi-day-offline pathology)
    PERSIST_DEBOUNCE_MS: 3_000,
  },

} as const;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return haversineMetersLatLng(a.lat, a.lng, b.lat, b.lng);
}

/**
 * Pure decision of whether a candidate fix represents real movement from the
 * last confirmed point, gated on the combined declared accuracy of both
 * fixes rather than a flat constant (a noisy fix with poor accuracy needs a
 * bigger jump to count than a precise one).
 */
export function shouldAcceptMove(
  last: GateFix | null,
  candidate: GateFix
): { isRealMove: boolean; requiredMoveM: number; distM: number } {
  if (!last) {
    return { isRealMove: true, requiredMoveM: 0, distM: 0 };
  }
  const distM = haversineMeters(last, candidate);
  const requiredMoveM = Math.max(
    MIN_MOVE_METERS_FLOOR,
    (last.accuracy ?? MAX_ACCURACY_M) + (candidate.accuracy ?? MAX_ACCURACY_M)
  );
  return { isRealMove: distM >= requiredMoveM, requiredMoveM, distM };
}
