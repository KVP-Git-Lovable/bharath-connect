import { describe, it, expect } from "vitest";
import { computeFilteredDistanceKm, filterTrackPoints, type TrackPoint } from "./gpsDistance";

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

function point(metersNorth: number, metersEast: number, tsMs: number, accuracy: number): TrackPoint {
  const { latitude, longitude } = offset(metersNorth, metersEast);
  return { latitude, longitude, timestamp: new Date(tsMs).toISOString(), accuracy };
}

describe("filterTrackPoints / computeFilteredDistanceKm", () => {
  it("rejects small-scale jitter within the combined accuracy radius (stationary user)", () => {
    // Simulates suyog-like data: ~48 points over 2 hours, each wobbling
    // within ~60m of a single spot with realistic-but-mediocre accuracy.
    const start = Date.parse("2026-08-26T10:07:00Z");
    const points: TrackPoint[] = [];
    let seed = 1;
    const rand = () => {
      // deterministic pseudo-random in [-1, 1]
      seed = (seed * 9301 + 49297) % 233280;
      return (seed / 233280) * 2 - 1;
    };
    for (let i = 0; i < 48; i++) {
      const ts = start + i * 2.5 * 60_000; // ~2.5 min apart over ~2h
      const north = rand() * 55;
      const east = rand() * 55;
      const accuracy = 40 + Math.abs(rand()) * 45; // 40-85m
      points.push(point(north, east, ts, accuracy));
    }
    const km = computeFilteredDistanceKm(points);
    expect(km).toBeLessThan(0.3);
  });

  it("still collapses a genuine two-cluster ping-pong (regression guard)", () => {
    const start = Date.parse("2026-08-25T09:00:00Z");
    const points: TrackPoint[] = [];
    // 20 alternations between two clusters ~1.36km apart, 60s apart, good accuracy.
    for (let i = 0; i < 40; i++) {
      const ts = start + i * 60_000;
      const atClusterB = i % 2 === 1;
      points.push(point(atClusterB ? 1360 : 0, 0, ts, 15));
    }
    const filtered = filterTrackPoints(points);
    const km = computeFilteredDistanceKm(points);
    // Should collapse to (near) a single cluster, not ~40 x 1.36km of ping-pong.
    expect(km).toBeLessThan(2);
    expect(filtered.length).toBeLessThan(points.length);
  });

  it("still counts genuine small real movement under good accuracy", () => {
    const start = Date.parse("2026-08-26T09:00:00Z");
    const points: TrackPoint[] = [
      point(0, 0, start, 6),
      point(25, 0, start + 30_000, 6),
      point(50, 0, start + 60_000, 6),
    ];
    const km = computeFilteredDistanceKm(points);
    expect(km).toBeGreaterThan(0.03); // ~50m of real walking should be counted
  });

  it("eventually counts slow real movement accumulated under poor accuracy (delayed, not lost)", () => {
    const start = Date.parse("2026-08-26T09:00:00Z");
    const points: TrackPoint[] = [];
    // Genuine straight-line walk of 250m over 10 steps of 25m each, but each
    // fix has poor (80m) accuracy so no single hop clears its own gate —
    // total displacement should still be credited once it accumulates past
    // the last confirmed anchor.
    for (let i = 0; i <= 10; i++) {
      points.push(point(i * 25, 0, start + i * 60_000, 80));
    }
    const km = computeFilteredDistanceKm(points);
    expect(km).toBeGreaterThan(0.15); // most of the real 250m should show up eventually
  });

  it("doesn't speed-reject a genuine jump after a long time gap (pre-existing behavior, unaffected by the accuracy-aware gate)", () => {
    const start = Date.parse("2026-08-26T09:00:00Z");
    const points: TrackPoint[] = [
      point(0, 0, start, 8),
      point(0, 5000, start + 10 * 60_000, 8), // 5km away after a 10-min gap
    ];
    // A flat implied-speed check over only 10 minutes would reject this as an
    // "impossible jump" (30 km/h is fine, but a shorter gap wouldn't be); the
    // long-gap branch accepts it instead of dropping real sparse trail data.
    const km = computeFilteredDistanceKm(points);
    expect(km).toBeCloseTo(5, 1);
  });
});
