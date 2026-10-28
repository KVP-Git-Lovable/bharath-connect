import { describe, it, expect, vi, beforeEach } from "vitest";

let queueSize = 0;
const flushMock = vi.fn(async () => ({ remaining: queueSize }));
vi.mock("@/services/gpsSyncQueue", () => ({
  flushPendingGpsPoints: () => flushMock(),
  getQueueSize: () => queueSize,
}));

let storedKm = 4;
const updates: number[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "gps_tracking") {
        const q: any = { select: () => q, eq: () => q, order: async () => ({ data: [{}, {}], error: null }) };
        return q;
      }
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { total_distance_km: storedKm } }),
        update: (v: { total_distance_km: number }) => ({
          eq: async () => { updates.push(v.total_distance_km); storedKm = v.total_distance_km; return { error: null }; },
        }),
      };
      return q;
    },
  },
}));

let computedKm = 6.5;
vi.mock("@/utils/gpsDistance", () => ({
  computeSnappedDistanceKm: async () => ({ totalKm: computedKm }),
}));

import { flushWithRetry, runRelockJob } from "./checkoutDistanceRelock";

const job = { attendanceId: "a1", userId: "u1", date: "2026-10-28", checkInTime: "x", checkOutTime: "y" };

beforeEach(() => {
  queueSize = 0;
  storedKm = 4;
  computedKm = 6.5;
  updates.length = 0;
  flushMock.mockClear();
});

describe("check-out distance", () => {
  it("retries the flush until the queue is empty", async () => {
    queueSize = 3;
    flushMock.mockImplementationOnce(async () => ({ remaining: 3 })).mockImplementationOnce(async () => {
      queueSize = 0;
      return { remaining: 0 };
    });
    const left = await flushWithRetry(10_000);
    expect(left).toBe(0);
    expect(flushMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the time budget and reports what is left", async () => {
    queueSize = 2;
    const left = await flushWithRetry(600);
    expect(left).toBe(2);
  });

  it("re-locks a short distance once late points have arrived", async () => {
    expect(await runRelockJob(job)).toBe(true);
    expect(updates).toEqual([6.5]);
  });

  it("never lowers an already-locked distance", async () => {
    computedKm = 3;
    expect(await runRelockJob(job)).toBe(true);
    expect(updates).toEqual([]);
  });
});
