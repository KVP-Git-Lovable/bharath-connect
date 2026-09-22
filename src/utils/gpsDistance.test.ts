import { describe, it, expect } from "vitest";
import {
  computeFilteredDistanceKm,
  filterTrackPoints,
  processTrajectory,
  GPS_PROCESSING_CONFIG,
  type TrackPoint,
} from "./gpsDistance";

const BASE_LAT = 12.8777;
const BASE_LNG = 74.8501;
const METERS_PER_DEG_LAT = 111_320;

/** Offset a lat/lng by a given number of meters north/east of the base point. */
function offset(metersNorth: number, metersEast: number) {
  const dLat = metersNorth / METERS_PER_DEG_LAT;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((BASE_LAT * Math.PI) / 180);
  const dLng = metersEast / metersPerDegLng;
  return { latitude: BASE_LAT + dLat, longitude: BASE_LNG + dLng };
}

function point(
  metersNorth: number,
  metersEast: number,
  tsMs: number,
  accuracy: number | null,
  extra?: Partial<TrackPoint>
): TrackPoint {
  const { latitude, longitude } = offset(metersNorth, metersEast);
  return { latitude, longitude, timestamp: new Date(tsMs).toISOString(), accuracy, ...extra };
}

const START = Date.parse("2026-08-26T09:00:00Z");

describe("stationary + jitter suppression", () => {
  it("rejects small-scale jitter for a stationary user (~0 km over 2 hours)", () => {
    const points: TrackPoint[] = [];
    let seed = 1;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return (seed / 233280) * 2 - 1;
    };
    for (let i = 0; i < 48; i++) {
      const ts = START + i * 2.5 * 60_000;
      points.push(point(rand() * 55, rand() * 55, ts, 40 + Math.abs(rand()) * 45));
    }
    const t = processTrajectory(points);
    expect(t.trackedDistanceKm).toBeLessThan(0.3);
    expect(t.metrics.stationaryPointCount).toBeGreaterThan(0);
  });

  it("a 20-minute customer visit with ±5–20 m GPS wobble adds ~0 km", () => {
    const points: TrackPoint[] = [];
    const wobble = [5, -12, 8, 15, -10, 18, -6, 12, -15, 9];
    for (let i = 0; i < 40; i++) {
      const w = wobble[i % wobble.length];
      points.push(point(w!, -w!, START + i * 30_000, 12, { speed: 0 }));
    }
    const t = processTrajectory(points);
    expect(t.trackedDistanceKm).toBeLessThan(0.1);
  });

  it("still counts genuine small real movement under good accuracy", () => {
    const points: TrackPoint[] = [
      point(0, 0, START, 6),
      point(25, 0, START + 30_000, 6),
      point(50, 0, START + 60_000, 6),
    ];
    expect(computeFilteredDistanceKm(points)).toBeGreaterThan(0.03);
  });

  it("eventually credits slow real movement under poor accuracy (delayed, not lost)", () => {
    const points: TrackPoint[] = [];
    for (let i = 0; i <= 10; i++) {
      points.push(point(i * 25, 0, START + i * 60_000, 80));
    }
    expect(computeFilteredDistanceKm(points)).toBeGreaterThan(0.15);
  });

  it("does not over-filter slow legitimate movement (5–20 km/h)", () => {
    for (const kmh of [5, 10, 15, 20]) {
      const stepM = (kmh * 1000) / 3600 * 15; // metres per 15s
      const points: TrackPoint[] = [];
      for (let i = 0; i <= 80; i++) {
        points.push(point(i * stepM, 0, START + i * 15_000, 8));
      }
      const total = (80 * stepM) / 1000;
      const km = computeFilteredDistanceKm(points);
      expect(km).toBeGreaterThan(total * 0.8);
    }
  });
});

describe("ping-pong / parallel-road protection", () => {
  it("collapses a two-cluster ping-pong (regression guard)", () => {
    const points: TrackPoint[] = [];
    for (let i = 0; i < 40; i++) {
      points.push(point(i % 2 === 1 ? 1360 : 0, 0, START + i * 60_000, 15));
    }
    const filtered = filterTrackPoints(points);
    expect(computeFilteredDistanceKm(points)).toBeLessThan(2);
    expect(filtered.length).toBeLessThan(points.length);
  });

  it("a single poor-accuracy sideways fix cannot drag the route onto a parallel road", () => {
    // Driving north on road A with good accuracy; one 140 m-accuracy fix lands
    // 120 m east (road B), then the trail continues on road A.
    const points: TrackPoint[] = [];
    for (let i = 0; i < 10; i++) points.push(point(i * 200, 0, START + i * 20_000, 10));
    points.push(point(10 * 200, 120, START + 10 * 20_000, 140)); // suspect sideways fix
    for (let i = 11; i < 20; i++) points.push(point(i * 200, 0, START + i * 20_000, 10));
    const t = processTrajectory(points);
    const straight = (19 * 200) / 1000;
    // Without the hold, the detour would add ~2×120 m; with it the total stays
    // within a whisker of the straight run.
    expect(t.trackedDistanceKm).toBeLessThan(straight + 0.1);
    expect(t.metrics.heldPointDiscardCount).toBeGreaterThan(0);
  });

  it("keeps a genuine relocation reported by a poor fix once the next fix confirms it", () => {
    const points: TrackPoint[] = [
      point(0, 0, START, 10),
      point(0, 200, START + 60_000, 90), // poor fix, sideways — held
      point(0, 230, START + 120_000, 15), // confirms the move
      point(0, 400, START + 180_000, 10),
    ];
    const t = processTrajectory(points);
    expect(t.trackedDistanceKm).toBeGreaterThan(0.3);
  });
});

describe("GPS jump detection (soft/hard speed)", () => {
  it("rejects an impossible jump and the distance is unaffected", () => {
    const points: TrackPoint[] = [
      point(0, 0, START, 8),
      point(100, 0, START + 20_000, 8),
      point(5100, 0, START + 25_000, 8), // 5 km in 5 s ⇒ 3600 km/h
      point(200, 0, START + 40_000, 8),
    ];
    const t = processTrajectory(points);
    expect(t.metrics.gpsJumpCount).toBe(1);
    expect(t.trackedDistanceKm).toBeLessThan(0.5);
  });

  it("device-reported speed can NEVER authorize a jump past the hard limit", () => {
    // 800 m in 5 s ⇒ 576 km/h; the device also (bogusly) reports 160 m/s —
    // agreement between two readings of the same bad fix proves nothing.
    const points: TrackPoint[] = [
      point(0, 0, START, 8, { speed: 160 }),
      point(800, 0, START + 5_000, 8, { speed: 160 }),
      point(30, 0, START + 25_000, 8, { speed: 0 }), // trail resumes near origin
    ];
    const t = processTrajectory(points);
    expect(t.metrics.gpsJumpCount).toBeGreaterThan(0);
    expect(t.trackedDistanceKm).toBeLessThan(0.1);
  });

  it("accepts a fast-but-plausible leg in the soft band when the device corroborates", () => {
    // 583 m in 15 s ⇒ 140 km/h with device speed ~39 m/s (140 km/h) on both ends.
    const points: TrackPoint[] = [
      point(0, 0, START, 8, { speed: 39 }),
      point(583, 0, START + 15_000, 8, { speed: 39 }),
      point(1166, 0, START + 30_000, 8, { speed: 39 }),
    ];
    const t = processTrajectory(points);
    expect(t.metrics.gpsJumpCount).toBe(0);
    expect(t.trackedDistanceKm).toBeGreaterThan(1.0);
  });

  it("rejects a soft-band leg when the device reports near-zero speed", () => {
    const points: TrackPoint[] = [
      point(0, 0, START, 8, { speed: 0 }),
      point(583, 0, START + 15_000, 8, { speed: 0 }), // implied 140 km/h, device says stopped
      point(30, 0, START + 30_000, 8, { speed: 0 }),
    ];
    const t = processTrajectory(points);
    expect(t.metrics.gpsJumpCount).toBeGreaterThan(0);
    expect(t.trackedDistanceKm).toBeLessThan(0.1);
  });

  it("clamps equal/sub-second timestamps instead of dividing by zero", () => {
    const points: TrackPoint[] = [
      point(0, 0, START, 8),
      point(50, 0, START + 200, 8), // 0.2 s later — clamped to 1 s ⇒ 180 km/h ⇒ jump
      point(60, 0, START + 20_000, 8),
    ];
    const t = processTrajectory(points);
    expect(Number.isFinite(t.trackedDistanceKm)).toBe(true);
  });
});

describe("degraded-state jump recovery", () => {
  const jumpTrail = (badCount: number): TrackPoint[] => {
    const points: TrackPoint[] = [
      point(0, 0, START, 8),
      point(300, 0, START + 60_000, 8),
    ];
    // A burst of far-away bad fixes within normal time deltas.
    for (let i = 0; i < badCount; i++) {
      points.push(point(20_000 + i * 40, 0, START + 120_000 + i * 10_000, 8));
    }
    return points;
  };

  it("1–2 consecutive bad jumps are rejected without a degraded event", () => {
    for (const n of [1, 2]) {
      const t = processTrajectory(jumpTrail(n));
      expect(t.metrics.gpsJumpCount).toBe(n);
      expect(t.metrics.gpsDegradedEvents).toBe(0);
      expect(t.trackedDistanceKm).toBeCloseTo(0.3, 1);
    }
  });

  it("3 consecutive bad jumps trigger degraded state and never admit a bad point", () => {
    const t = processTrajectory(jumpTrail(3));
    expect(t.metrics.gpsDegradedEvents).toBe(1);
    // The far cluster only has one point left after the 3 rejections; nothing
    // from the jump burst may be connected to the pre-jump trail.
    expect(t.trackedDistanceKm).toBeLessThan(0.5);
  });

  it("10 consecutive bad jumps stay excluded (no runaway acceptance)", () => {
    const t = processTrajectory(jumpTrail(10));
    expect(t.metrics.gpsDegradedEvents).toBeGreaterThanOrEqual(1);
    expect(t.trackedDistanceKm).toBeLessThan(1);
  });

  it("after degradation, a good fix starts a NEW segment (no leg from the stale anchor)", () => {
    const points = jumpTrail(3);
    // A genuine high-quality relocation far from both clusters, later on.
    points.push(point(50_000, 0, START + 200_000, 10));
    points.push(point(50_100, 0, START + 220_000, 10));
    const t = processTrajectory(points);
    expect(t.metrics.segmentCount).toBeGreaterThanOrEqual(2);
    // No 50 km leg may be counted.
    expect(t.trackedDistanceKm).toBeLessThan(1);
  });

  it("a degraded event demands a high-quality fix to re-seed", () => {
    const points = jumpTrail(3);
    points.push(point(50_000, 0, START + 200_000, 120)); // poor fix — discarded
    points.push(point(50_050, 0, START + 220_000, 10)); // good fix — re-seeds
    const t = processTrajectory(points);
    expect(t.metrics.degradedDiscardCount).toBeGreaterThan(0);
  });
});

describe("gaps and segments", () => {
  it("a 5 km relocation after a 10-min blackout is a gap leg, not tracked distance", () => {
    const points: TrackPoint[] = [
      point(0, 0, START, 8),
      point(30, 0, START + 60_000, 8),
      point(5000, 0, START + 11 * 60_000, 8), // 10-min hole then 5 km away
      point(5030, 0, START + 12 * 60_000, 8),
    ];
    const t = processTrajectory(points);
    expect(t.metrics.gpsGapCount).toBe(1);
    expect(t.segments.length).toBe(2);
    expect(t.gapLegsKm).toBeCloseTo(5, 0);
    expect(t.trackedDistanceKm).toBeLessThan(0.2); // bridging owns the 5 km, as "estimated"
  });

  it("detects 5/10/20-minute blackouts as gaps", () => {
    for (const gapMin of [5, 10, 20]) {
      const points: TrackPoint[] = [
        point(0, 0, START, 8),
        point(40, 0, START + 60_000, 8),
        point(2000, 0, START + 60_000 + gapMin * 60_000, 8),
        point(2040, 0, START + 120_000 + gapMin * 60_000, 8),
      ];
      const t = processTrajectory(points);
      expect(t.metrics.gpsGapCount).toBe(1);
      expect(t.metrics.longestGapMinutes).toBeGreaterThanOrEqual(gapMin - 0.1);
    }
  });
});

describe("duplicates, accuracy bands, invalid input", () => {
  it("duplicate points don't add distance", () => {
    const p1 = point(0, 0, START, 8);
    const points: TrackPoint[] = [p1, { ...p1 }, { ...p1 }, point(40, 0, START + 30_000, 8)];
    const t = processTrajectory(points);
    expect(t.metrics.duplicatePointCount).toBe(2);
    expect(t.trackedDistanceKm).toBeLessThan(0.06);
  });

  it("accuracy sweep: ≤150 m processed, >150 m rejected", () => {
    const points: TrackPoint[] = [20, 50, 100, 150, 200].map((acc, i) =>
      point(i * 100, 0, START + i * 30_000, acc)
    );
    const t = processTrajectory(points);
    expect(t.metrics.poorAccuracyPointCount).toBe(1); // only the 200 m fix
  });

  it("null accuracy (historical rows) is kept, counted as fallback, and still yields distance", () => {
    const points: TrackPoint[] = [];
    for (let i = 0; i <= 10; i++) points.push(point(i * 300, 0, START + i * 60_000, null));
    const t = processTrajectory(points);
    expect(t.metrics.accuracyFallbackPointCount).toBe(11);
    expect(t.trackedDistanceKm).toBeGreaterThan(2.5);
  });

  it("unsorted input is sorted by device timestamp before processing", () => {
    const ordered: TrackPoint[] = [];
    for (let i = 0; i <= 5; i++) ordered.push(point(i * 200, 0, START + i * 30_000, 8));
    const shuffled = [ordered[3], ordered[0], ordered[5], ordered[1], ordered[4], ordered[2]];
    expect(computeFilteredDistanceKm(shuffled)).toBeCloseTo(
      computeFilteredDistanceKm(ordered),
      3
    );
  });

  it("garbage input never throws and yields an empty-but-valid result", () => {
    const junk = [
      { latitude: NaN, longitude: 0, timestamp: "nope" },
      { latitude: 500, longitude: 0, timestamp: new Date(START).toISOString() },
      { latitude: 0, longitude: 999, timestamp: new Date(START).toISOString() },
    ] as TrackPoint[];
    const t = processTrajectory(junk);
    expect(t.points.length).toBe(0);
    expect(t.trackedDistanceKm).toBe(0);
    expect(t.metrics.invalidPointCount).toBe(3);
  });

  it("a day with some bad points still produces distance from the good ones", () => {
    const points: TrackPoint[] = [];
    for (let i = 0; i <= 20; i++) points.push(point(i * 200, 0, START + i * 30_000, 10));
    points.push(point(90_000, 0, START + 21 * 30_000, 10)); // jump
    for (let i = 0; i < 5; i++) points.push(point(0, 0, START + (22 + i) * 30_000, 400)); // poor acc
    const t = processTrajectory(points);
    expect(t.trackedDistanceKm).toBeGreaterThan(3.5);
  });
});

describe("attendance window option", () => {
  it("no window (missing attendance) ⇒ all points processed", () => {
    const points: TrackPoint[] = [];
    for (let i = 0; i <= 5; i++) points.push(point(i * 300, 0, START + i * 60_000, 8));
    const t = processTrajectory(points, { window: null });
    expect(t.metrics.windowFilteredPointCount).toBe(0);
    expect(t.trackedDistanceKm).toBeGreaterThan(1);
  });

  it("open window (no checkout) keeps everything after check-in, honoring grace before it", () => {
    const points: TrackPoint[] = [
      point(0, 0, START - 10 * 60_000, 8), // 10 min before check-in — inside grace
      point(300, 0, START + 60_000, 8),
      point(600, 0, START + 4 * 3600_000, 8), // hours later — open session keeps it
      point(900, 0, START - 60 * 60_000, 8), // an hour before — outside grace
    ];
    const t = processTrajectory(points, {
      window: { checkInTime: new Date(START).toISOString(), checkOutTime: null },
    });
    expect(t.metrics.windowFilteredPointCount).toBe(1);
  });

  it("a closed window excludes the other session's points", () => {
    const points: TrackPoint[] = [
      point(0, 0, START, 8),
      point(300, 0, START + 30 * 60_000, 8),
      point(9000, 0, START + 5 * 3600_000, 8), // afternoon session — not this window
    ];
    const t = processTrajectory(points, {
      window: {
        checkInTime: new Date(START).toISOString(),
        checkOutTime: new Date(START + 3600_000).toISOString(),
      },
    });
    expect(t.metrics.windowFilteredPointCount).toBe(1);
  });
});

describe("highway / urban plausibility", () => {
  it("highway driving at 60–120 km/h is counted within ~5%", () => {
    for (const kmh of [60, 90, 120]) {
      const stepM = (kmh * 1000) / 3600 * 30; // metres per 30 s
      const points: TrackPoint[] = [];
      for (let i = 0; i <= 60; i++) {
        points.push(point(i * stepM, 0, START + i * 30_000, 10, { speed: (kmh * 1000) / 3600 }));
      }
      const total = (60 * stepM) / 1000;
      const km = computeFilteredDistanceKm(points);
      expect(Math.abs(km - total) / total).toBeLessThan(0.05);
    }
  });

  it("urban stop-start driving keeps the moving legs and zeroes the stops", () => {
    const points: TrackPoint[] = [];
    let ts = START;
    let north = 0;
    for (let block = 0; block < 4; block++) {
      // 2 minutes of driving at ~36 km/h (150 m per 15 s)
      for (let i = 0; i < 8; i++) {
        north += 150;
        ts += 15_000;
        points.push(point(north, 0, ts, 10, { speed: 10 }));
      }
      // 2 minutes stopped at a light with jitter
      for (let i = 0; i < 8; i++) {
        ts += 15_000;
        points.push(point(north + (i % 2 === 0 ? 8 : -8), 0, ts, 15, { speed: 0 }));
      }
    }
    const km = computeFilteredDistanceKm(points);
    const driven = (4 * 8 * 150) / 1000;
    expect(km).toBeGreaterThan(driven * 0.85);
    expect(km).toBeLessThan(driven * 1.1);
  });
});

describe("config", () => {
  it("thresholds are configurable per call", () => {
    const points: TrackPoint[] = [
      point(0, 0, START, 8),
      point(400, 0, START + 10_000, 8), // 144 km/h implied
      point(430, 0, START + 40_000, 8),
    ];
    const strict = processTrajectory(points, {
      config: { SOFT_SPEED_THRESHOLD_KMH: 60, HARD_SPEED_LIMIT_KMH: 100 },
    });
    expect(strict.metrics.gpsJumpCount).toBeGreaterThan(0);
    const lenient = processTrajectory(points, {
      config: { SOFT_SPEED_THRESHOLD_KMH: 150 },
    });
    expect(lenient.metrics.gpsJumpCount).toBe(0);
  });

  it("exports a single config object with the documented keys", () => {
    expect(GPS_PROCESSING_CONFIG.MAX_ACCURACY_METERS).toBe(150);
    expect(GPS_PROCESSING_CONFIG.HARD_SPEED_LIMIT_KMH).toBeGreaterThanOrEqual(
      GPS_PROCESSING_CONFIG.SOFT_SPEED_THRESHOLD_KMH
    );
    expect(GPS_PROCESSING_CONFIG.SESSION_GRACE_MS).toBe(15 * 60 * 1000);
  });
});
