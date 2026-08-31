import { describe, it, expect } from "vitest";
import { runGpsBenchmark, formatGpsBenchmark } from "./gpsBenchmark";
import { haversineMeters, type TrackPoint } from "./gpsDistance";

/**
 * Synthetic reproduction of the known problem day: ~43 km of actual road
 * travel that the old blind-sum pipeline reported as 60–70 km, built from
 * the same noise sources seen in production (stationary drift at customer
 * visits, a stale-fix ping-pong episode, GPS jump outliers, and a capture
 * blackout). A real day's gps_tracking export can be dropped into
 * src/test/fixtures/gps/ and run through runGpsBenchmark the same way.
 *
 * The reference (43 km) is only compared against — nothing in the engine
 * knows about it.
 */

const BASE_LAT = 12.8777;
const BASE_LNG = 74.8501;
const METERS_PER_DEG_LAT = 111_320;

function at(metersNorth: number, metersEast: number, tsMs: number, accuracy: number, speed?: number): TrackPoint {
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((BASE_LAT * Math.PI) / 180);
  return {
    latitude: BASE_LAT + metersNorth / METERS_PER_DEG_LAT,
    longitude: BASE_LNG + metersEast / metersPerDegLng,
    timestamp: new Date(tsMs).toISOString(),
    accuracy,
    speed: speed ?? null,
  };
}

function buildProblemDay(): { points: TrackPoint[]; referenceKm: number } {
  const points: TrackPoint[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return (seed / 233280) * 2 - 1;
  };

  let ts = Date.parse("2026-08-20T03:30:00Z");
  let north = 0;

  // Leg 1 — 20 km at ~40 km/h (333 m per 30 s), decent accuracy.
  for (let i = 0; i < 60; i++) {
    north += 333.3;
    ts += 30_000;
    points.push(at(north, rand() * 8, ts, 10 + Math.abs(rand()) * 10, 11));
  }

  // Customer visit 1 — 45 min stationary with mediocre-accuracy drift.
  const visit1North = north;
  for (let i = 0; i < 45; i++) {
    ts += 60_000;
    points.push(at(visit1North + rand() * 35, rand() * 35, ts, 45 + Math.abs(rand()) * 45, 0));
  }

  // Stale-fix ping-pong — 14 min alternating with a cached fix 1.3 km east.
  for (let i = 0; i < 14; i++) {
    ts += 60_000;
    const atTower = i % 2 === 1;
    points.push(at(visit1North + rand() * 10, atTower ? 1300 : rand() * 10, ts, 25, 0));
  }

  // Leg 2 — 15 km at ~45 km/h (375 m per 30 s).
  for (let i = 0; i < 40; i++) {
    north += 375;
    ts += 30_000;
    points.push(at(north, rand() * 8, ts, 10 + Math.abs(rand()) * 10, 12.5));
  }

  // Two teleport outliers (1.8 km east, back within seconds).
  ts += 30_000;
  points.push(at(north, 1800, ts, 30, 0));
  ts += 10_000;
  points.push(at(north + 20, rand() * 10, ts, 12, 0));
  ts += 30_000;
  points.push(at(north, 1750, ts, 35, 0));
  ts += 10_000;
  points.push(at(north + 40, rand() * 10, ts, 12, 0));

  // Capture blackout — 12 minutes while driving 8 km (real travel, no GPS).
  ts += 12 * 60_000;
  north += 8000;
  points.push(at(north, rand() * 8, ts, 12, 0));

  // Customer visit 2 — 30 min stationary drift.
  for (let i = 0; i < 30; i++) {
    ts += 60_000;
    points.push(at(north + rand() * 30, rand() * 30, ts, 40 + Math.abs(rand()) * 40, 0));
  }

  // Ground truth: 20 + 15 + 8 km of actual road travel.
  return { points, referenceKm: 43 };
}

// Deterministic snap stage that mirrors the production pipeline's accounting:
// tracked = distance along validated segments, estimated = bridged gap legs.
const offlineSnap = async (segments: TrackPoint[][]) => {
  let tracked = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      tracked += haversineMeters(
        seg[i - 1].latitude, seg[i - 1].longitude,
        seg[i].latitude, seg[i].longitude
      );
    }
  }
  let estimated = 0;
  for (let s = 1; s < segments.length; s++) {
    const a = segments[s - 1][segments[s - 1].length - 1];
    const b = segments[s][0];
    estimated += haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  return {
    distanceMeters: tracked + estimated,
    trackedMeters: tracked,
    estimatedMeters: estimated,
    snappingFallbackUsed: false,
  };
};

describe("runGpsBenchmark — known ~43 km problem day", () => {
  it("the raw blind sum reproduces the historical 60–70 km overcount", async () => {
    const { points } = buildProblemDay();
    const report = await runGpsBenchmark(points, { snap: null });
    expect(report.rawHaversineKm).toBeGreaterThan(55);
  });

  it("the engine + bridging land near the reference without knowing it", async () => {
    const { points, referenceKm } = buildProblemDay();
    const report = await runGpsBenchmark(points, {
      tripId: "problem-day-43km",
      referenceKm,
      snap: offlineSnap,
    });

    console.log(formatGpsBenchmark(report));

    // Pipeline invariants (never assert the exact reference — no tuning-to-fit).
    expect(report.validatedKm).toBeLessThan(report.rawHaversineKm);
    expect(report.gpsGapCount).toBeGreaterThanOrEqual(1);
    expect(report.estimatedKm).toBeGreaterThan(7); // the blackout leg, classified estimated
    expect(report.stationaryPointCount).toBeGreaterThan(30);
    expect(report.gpsJumpCount + report.pingPongRemovedCount + report.heldPointDiscardCount).toBeGreaterThan(0);

    // The overcount must be substantially reduced: within 15% of ground truth,
    // versus the ~40%+ error of the raw sum.
    expect(report.percentErrorPct).toBeLessThan(15);
    expect(report.rawHaversineKm - referenceKm).toBeGreaterThan(12);
  });

  it("accepted points never exceed raw points and all counters are sane", async () => {
    const { points } = buildProblemDay();
    const r = await runGpsBenchmark(points, { snap: null });
    expect(r.acceptedPointCount).toBeLessThanOrEqual(r.rawPointCount);
    for (const key of [
      "rejectedPointCount",
      "duplicatePointCount",
      "poorAccuracyPointCount",
      "gpsJumpCount",
      "stationaryPointCount",
      "gpsGapCount",
      "segmentCount",
    ] as const) {
      expect(r[key]).toBeGreaterThanOrEqual(0);
    }
  });
});
