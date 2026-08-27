import { haversineMeters as haversineMetersLatLng } from "@/utils/gpsDistance";

export interface GateFix {
  lat: number;
  lng: number;
  ts: number;
  accuracy: number | null;
}

const MIN_MOVE_METERS_FLOOR = 10; // floor — only throttles capture-side writes;
                                   // gpsDistance.ts is the authoritative arbiter
                                   // of counted distance for display
const MAX_ACCURACY_M = 150;        // same worst-case fallback used for accuracy gating

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
