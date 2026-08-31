import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (name: string, opts: unknown) => invokeMock(name, opts),
    },
  },
}));

const BASE_LAT = 12.8777;
const BASE_LNG = 74.8501;
const METERS_PER_DEG_LAT = 111_320;

function pt(metersNorth: number, tsMs: number) {
  return {
    latitude: BASE_LAT + metersNorth / METERS_PER_DEG_LAT,
    longitude: BASE_LNG,
    timestamp: new Date(tsMs).toISOString(),
  };
}

const START = Date.parse("2026-08-26T09:00:00Z");

// Fresh module per test so the module-level circuit breaker starts closed.
async function loadRoute() {
  vi.resetModules();
  return await import("./googleRoute");
}

const snapEcho =
  (meters: number) => (name: string, opts: { body: { points: unknown[] } }) => {
  if (name === "snap-roads") {
    return Promise.resolve({
      data: { path: opts.body.points, distanceMeters: meters, snapped: true },
      error: null,
    });
  }
  // snap-gps-route unavailable ⇒ bridgeGap falls back to a straight line.
  return Promise.resolve({ data: { polyline: null, distanceMeters: null }, error: null });
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe("getSnappedRoute (segments)", () => {
  it("separates tracked (snapped) metres from estimated (bridged) metres", async () => {
    const { getSnappedRoute } = await loadRoute();
    invokeMock.mockImplementation(snapEcho(100));
    const segA = [pt(0, START), pt(200, START + 60_000), pt(400, START + 120_000)];
    const segB = [pt(1400, START + 10 * 60_000), pt(1600, START + 11 * 60_000)];
    const route = await getSnappedRoute([segA, segB]);

    expect(route.distanceMeters).not.toBeNull();
    expect(route.trackedMeters).toBe(200); // two snapped batches of 100 m each
    expect(route.estimatedMeters).toBeGreaterThan(900); // ~1 km straight bridge
    expect(route.bridgedMeters).toBe(route.estimatedMeters);
    expect(route.distanceMeters).toBeCloseTo(route.trackedMeters + route.estimatedMeters, 5);
    // A straight-line bridge is not a fully snapped route.
    expect(route.snappingComplete).toBe(false);
    expect(route.source).toBe("mixed");
    // One snap call per segment + one bridge call for the gap.
    expect(invokeMock.mock.calls.filter((c) => c[0] === "snap-roads")).toHaveLength(2);
    expect(invokeMock.mock.calls.filter((c) => c[0] === "snap-gps-route")).toHaveLength(1);
  });

  it("fully snapped single segment reads road-snapped and complete", async () => {
    const { getSnappedRoute } = await loadRoute();
    invokeMock.mockImplementation(snapEcho(500));
    const seg = [pt(0, START), pt(250, START + 60_000), pt(500, START + 120_000)];
    const route = await getSnappedRoute([seg]);
    expect(route.source).toBe("road-snapped");
    expect(route.snappingComplete).toBe(true);
    expect(route.snappingFallbackUsed).toBe(false);
    expect(route.snapped).toBe(true);
    expect(route.estimatedMeters).toBe(0);
    expect(route.trackedMeters).toBe(500);
  });

  it("batch seams are counted once and the seam vertex is not duplicated", async () => {
    const { getSnappedRoute } = await loadRoute();
    invokeMock.mockImplementation(snapEcho(10));
    const seg = Array.from({ length: 150 }, (_, i) => pt(i * 20, START + i * 15_000));
    const route = await getSnappedRoute([seg]);
    // Batches: [0..99] and [99..149] (one-point overlap) ⇒ 2 snap calls,
    // 10 m each, and the echoed path keeps exactly 150 vertices.
    expect(invokeMock.mock.calls.filter((c) => c[0] === "snap-roads")).toHaveLength(2);
    expect(route.trackedMeters).toBe(20);
    expect(route.path).toHaveLength(150);
  });

  it("snap failure falls back to VALIDATED trajectory distance, flagged honestly", async () => {
    const { getSnappedRoute } = await loadRoute();
    invokeMock.mockImplementation((name: string) => {
      if (name === "snap-roads") return Promise.resolve({ data: null, error: new Error("boom") });
      return Promise.resolve({ data: null, error: new Error("boom") });
    });
    const seg = [pt(0, START), pt(400, START + 60_000), pt(800, START + 120_000)];
    const route = await getSnappedRoute([seg]);
    // Distance still produced — measured along the validated points (~800 m),
    // never claimed as road-snapped.
    expect(route.distanceMeters).toBeGreaterThan(700);
    expect(route.snappingFallbackUsed).toBe(true);
    expect(route.snappingComplete).toBe(false);
    expect(route.snapped).toBe(false);
    expect(route.source).toBe("mixed");
  });

  it("returns null distance for fewer than 2 total points", async () => {
    const { getSnappedRoute } = await loadRoute();
    const route = await getSnappedRoute([[pt(0, START)]]);
    expect(route.distanceMeters).toBeNull();
    expect(route.path).toHaveLength(0);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("a route that is ONLY a bridge is classified estimated-gap", async () => {
    const { getSnappedRoute } = await loadRoute();
    invokeMock.mockImplementation(snapEcho(0));
    // Two single-point segments 2 km apart: nothing to snap, one gap to bridge.
    const route = await getSnappedRoute([
      [pt(0, START)],
      [pt(2000, START + 30 * 60_000)],
    ]);
    expect(route.trackedMeters).toBe(0);
    expect(route.estimatedMeters).toBeGreaterThan(1900);
    expect(route.source).toBe("estimated-gap");
  });

  it("an implausible gap (over speed cap) is not bridged and adds nothing", async () => {
    const { getSnappedRoute } = await loadRoute();
    invokeMock.mockImplementation(snapEcho(100));
    // 150 km apart 10 minutes later ⇒ 900 km/h ⇒ not a road journey.
    const segA = [pt(0, START), pt(300, START + 60_000)];
    const segB = [pt(150_000, START + 10 * 60_000), pt(150_300, START + 11 * 60_000)];
    const route = await getSnappedRoute([segA, segB]);
    expect(route.estimatedMeters).toBe(0);
    expect(route.trackedMeters).toBe(200);
    expect(route.snappingComplete).toBe(false); // the trail has an unexplained hole
    expect(invokeMock.mock.calls.filter((c) => c[0] === "snap-gps-route")).toHaveLength(0);
  });
});
