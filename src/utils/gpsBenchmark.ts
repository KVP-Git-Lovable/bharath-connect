/**
 * Development-only accuracy benchmark for the GPS trajectory engine.
 *
 * Feed it one real day's raw gps_tracking rows (exported as JSON) and it
 * reports every stage of the distance pipeline —
 *
 *   Raw GPS distance → Validated GPS distance → Road-snapped distance
 *     → Estimated (bridged) distance → Final displayed distance
 *
 * — plus the full processing metrics, and, when a ground-truth reference is
 * provided, the absolute/percentage error. The reference is only COMPARED
 * against; it never influences the algorithm (never tune thresholds to force
 * a specific number).
 *
 * Not imported by any production page. Use from a dev console, a script, or
 * the vitest fixture test (gpsBenchmark.test.ts).
 */

import {
  computeDistanceKm,
  processTrajectory,
  type AttendanceWindow,
  type GpsProcessingMetrics,
  type TrackPoint,
} from "@/utils/gpsDistance";
import { filterPointsByAttendance, type AttendanceRow } from "@/utils/attendanceGate";

export interface GpsBenchmarkReport extends GpsProcessingMetrics {
  tripId: string;
  date: string | null;
  /** Blind sum of raw point-to-point Haversine legs (the old failure mode). */
  rawHaversineKm: number;
  /** Validated trajectory distance (tracked, gap legs excluded). */
  validatedKm: number;
  /** Road-snapped tracked distance, when snapping ran. */
  snappedKm: number | null;
  /** Estimated (bridged) distance, when snapping ran. */
  estimatedKm: number;
  /** What Day Tracking would display. */
  finalKm: number;
  gapLegsKm: number;
  snappingUsed: boolean;
  snappingFallbackUsed: boolean;
  absoluteErrorKm?: number;
  percentErrorPct?: number;
}

export interface GpsBenchmarkOptions {
  tripId?: string;
  attendanceRows?: AttendanceRow[];
  window?: AttendanceWindow | null;
  /** Known real road distance to compare against (never forced). */
  referenceKm?: number;
  /**
   * Road snapping stage. Defaults to the production getSnappedRoute (network);
   * pass `null` to run the engine stages only (deterministic, e.g. in tests).
   */
  snap?:
    | ((segments: TrackPoint[][]) => Promise<{
        distanceMeters: number | null;
        trackedMeters: number;
        estimatedMeters: number;
        snappingFallbackUsed: boolean;
      }>)
    | null;
}

export async function runGpsBenchmark(
  rawPoints: (TrackPoint & { date?: string })[],
  options: GpsBenchmarkOptions = {}
): Promise<GpsBenchmarkReport> {
  const gated = options.attendanceRows
    ? filterPointsByAttendance(rawPoints, options.attendanceRows)
    : rawPoints;

  const rawSorted = [...gated].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
  const rawHaversineKm = computeDistanceKm(rawSorted);

  const trajectory = processTrajectory(gated, { window: options.window });

  let snappedKm: number | null = null;
  let estimatedKm = 0;
  let finalKm = trajectory.trackedDistanceKm;
  let snappingUsed = false;
  let snappingFallbackUsed = false;

  const snap =
    options.snap === null
      ? null
      : options.snap ??
        (async (segments: TrackPoint[][]) => {
          const { getSnappedRoute } = await import("@/utils/googleRoute");
          return getSnappedRoute(segments);
        });

  if (snap && trajectory.points.length >= 2) {
    try {
      const route = await snap(trajectory.segments);
      if (route.distanceMeters != null) {
        snappingUsed = true;
        snappingFallbackUsed = route.snappingFallbackUsed;
        snappedKm = route.trackedMeters / 1000;
        estimatedKm = route.estimatedMeters / 1000;
        finalKm = route.distanceMeters / 1000;
      }
    } catch {
      // Snapping unavailable — the validated distance stands.
    }
  }

  const report: GpsBenchmarkReport = {
    ...trajectory.metrics,
    tripId: options.tripId ?? "trip",
    date: rawSorted[0]?.timestamp?.slice(0, 10) ?? null,
    rawHaversineKm,
    validatedKm: trajectory.trackedDistanceKm,
    snappedKm,
    estimatedKm,
    finalKm,
    gapLegsKm: trajectory.gapLegsKm,
    snappingUsed,
    snappingFallbackUsed,
  };

  if (options.referenceKm != null && options.referenceKm > 0) {
    report.absoluteErrorKm = Math.abs(finalKm - options.referenceKm);
    report.percentErrorPct = (report.absoluteErrorKm / options.referenceKm) * 100;
  }

  return report;
}

/** Human-readable stage summary for console use. */
export function formatGpsBenchmark(r: GpsBenchmarkReport): string {
  const lines = [
    `Trip ${r.tripId} (${r.date ?? "unknown date"})`,
    `  Raw GPS Distance:       ${r.rawHaversineKm.toFixed(1)} km  (${r.rawPointCount} points)`,
    `  Validated Distance:     ${r.validatedKm.toFixed(1)} km  (${r.acceptedPointCount} points, ${r.segmentCount} segments)`,
    `  Road-Snapped Distance:  ${r.snappedKm != null ? r.snappedKm.toFixed(1) + " km" : "n/a"}`,
    `  Estimated Gap Distance: ${r.estimatedKm.toFixed(1)} km  (${r.gpsGapCount} gaps, legs ${r.gapLegsKm.toFixed(1)} km)`,
    `  Final Distance:         ${r.finalKm.toFixed(1)} km`,
    `  Rejected: ${r.rejectedPointCount} (jumps ${r.gpsJumpCount}, poor acc ${r.poorAccuracyPointCount}, dup ${r.duplicatePointCount}) · stationary ${r.stationaryPointCount}`,
  ];
  if (r.absoluteErrorKm != null) {
    lines.push(
      `  vs reference:           ±${r.absoluteErrorKm.toFixed(1)} km (${r.percentErrorPct!.toFixed(1)}%)`
    );
  }
  return lines.join("\n");
}
