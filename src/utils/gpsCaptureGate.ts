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
