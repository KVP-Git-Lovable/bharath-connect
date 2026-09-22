import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const upsertMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (rows: unknown[], opts: unknown) => upsertMock(table, rows, opts),
    }),
  },
}));

import {
  enqueueGpsPoint,
  flushPendingGpsPoints,
  getQueueSize,
  getDroppedPointCount,
  peekNewestQueuedPoint,
  initGpsSyncQueue,
  __resetGpsSyncQueueForTests,
} from "./gpsSyncQueue";
import { GPS_CAPTURE_CONFIG } from "@/utils/gpsCaptureGate";

const CFG = GPS_CAPTURE_CONFIG.QUEUE;

function point(i: number, overrides: Partial<Parameters<typeof enqueueGpsPoint>[0]> = {}) {
  return {
    user_id: "user-1",
    latitude: 12.8 + i * 0.001,
    longitude: 74.8,
    accuracy: 10,
    speed: null,
    heading: null,
    timestamp: new Date(Date.parse("2026-08-26T09:00:00Z") + i * 15_000).toISOString(),
    date: "2026-08-26",
    ...overrides,
  };
}

beforeEach(() => {
  __resetGpsSyncQueueForTests();
  localStorage.clear();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("gpsSyncQueue", () => {
  it("enqueue is synchronous and does not upload below the batch size", () => {
    for (let i = 0; i < CFG.BATCH_SIZE - 1; i++) enqueueGpsPoint(point(i));
    expect(getQueueSize()).toBe(CFG.BATCH_SIZE - 1);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("reaching the batch size triggers ONE batched upsert and drains the queue", async () => {
    for (let i = 0; i < CFG.BATCH_SIZE; i++) enqueueGpsPoint(point(i));
    await flushPendingGpsPoints();
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [table, rows, opts] = upsertMock.mock.calls[0];
    expect(table).toBe("gps_tracking");
    expect(rows).toHaveLength(CFG.BATCH_SIZE);
    expect(rows[0].id).toMatch(/[0-9a-f-]{36}/);
    expect(opts).toEqual({ onConflict: "id", ignoreDuplicates: true });
    expect(getQueueSize()).toBe(0);
  });

  it("points survive an upload failure and retry with the SAME ids (idempotent)", async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: "network down" } });
    for (let i = 0; i < 5; i++) enqueueGpsPoint(point(i));
    await flushPendingGpsPoints();
    expect(getQueueSize()).toBe(5); // nothing removed on failure
    const firstIds = upsertMock.mock.calls[0]![1].map((r: { id: string }) => r.id);

    await flushPendingGpsPoints(); // retry succeeds
    expect(getQueueSize()).toBe(0);
    const retryIds = upsertMock.mock.calls[1]![1].map((r: { id: string }) => r.id);
    expect(retryIds).toEqual(firstIds); // same client UUIDs — server dedupes
  });

  it("only one flush is in flight at a time (single-flight coordinator)", async () => {
    let resolveUpsert: (v: { error: null }) => void;
    upsertMock.mockImplementationOnce(
      () => new Promise((res) => (resolveUpsert = res as typeof resolveUpsert))
    );
    for (let i = 0; i < 3; i++) enqueueGpsPoint(point(i));
    const a = flushPendingGpsPoints();
    const b = flushPendingGpsPoints();
    expect(b).toBe(a); // same promise
    resolveUpsert!({ error: null });
    await a;
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("uploads in chunks of CHUNK_SIZE", async () => {
    // Accumulate offline first so the batch-size auto-flush can't drain early.
    upsertMock.mockResolvedValue({ error: { message: "offline" } });
    for (let i = 0; i < CFG.CHUNK_SIZE + 10; i++) enqueueGpsPoint(point(i));
    await new Promise((r) => setTimeout(r, 0));
    expect(getQueueSize()).toBe(CFG.CHUNK_SIZE + 10);

    upsertMock.mockReset();
    upsertMock.mockResolvedValue({ error: null });
    await flushPendingGpsPoints();
    expect(getQueueSize()).toBe(0);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[0]![1]).toHaveLength(CFG.CHUNK_SIZE);
    expect(upsertMock.mock.calls[1]![1]).toHaveLength(10);
  });

  it("persists to localStorage and restores across a restart", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) enqueueGpsPoint(point(i));
    vi.advanceTimersByTime(CFG.PERSIST_DEBOUNCE_MS + 100); // debounced persist
    expect(localStorage.getItem("gps-sync-queue:v1")).toContain('"user-1"');

    __resetGpsSyncQueueForTests(); // simulate app restart (localStorage kept)
    expect(getQueueSize()).toBe(0);
    initGpsSyncQueue();
    expect(getQueueSize()).toBe(3);
  });

  it("peekNewestQueuedPoint returns the newest entry for the user/date", () => {
    enqueueGpsPoint(point(0));
    enqueueGpsPoint(point(5));
    enqueueGpsPoint(point(2));
    enqueueGpsPoint(point(9, { user_id: "someone-else" }));
    const newest = peekNewestQueuedPoint("user-1", "2026-08-26");
    expect(newest?.timestamp).toBe(point(5).timestamp);
    expect(peekNewestQueuedPoint("user-1", "2026-08-27")).toBeNull();
  });

  it("hard cap drops oldest points with an explicit count, never silently", async () => {
    upsertMock.mockResolvedValue({ error: { message: "offline" } }); // flush can't help
    for (let i = 0; i < CFG.MAX_POINTS + 25; i++) enqueueGpsPoint(point(i));
    // allow the fire-and-forget flush attempts to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(getQueueSize()).toBeLessThanOrEqual(CFG.MAX_POINTS);
    expect(getDroppedPointCount()).toBeGreaterThan(0);
  });

  it("flush with an empty queue is a no-op", async () => {
    const res = await flushPendingGpsPoints();
    expect(res.remaining).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
