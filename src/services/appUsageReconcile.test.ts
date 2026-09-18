import { describe, it, expect } from "vitest";
import {
  deterministicId,
  localDateString,
  mapRecordsToRows,
  splitAtLocalMidnight,
  type NativeUsageRecord,
} from "./appUsageReconcile";

const BASE: NativeUsageRecord = {
  v: 1,
  t: "interval",
  session_id: "11111111-1111-4111-8111-111111111111",
  device_id: "22222222-2222-4222-8222-222222222222",
  boot_id: "33333333-3333-4333-8333-333333333333",
  wall: 0,
  elapsed: 0,
  app_version: "1.0",
  os_version: "14",
  device_model: "Pixel",
  platform: "android",
};

function at(h: number, m: number, day = 18): number {
  return new Date(2026, 8, day, h, m, 0, 0).getTime();
}

function interval(
  kind: "foreground" | "background",
  startMs: number,
  endMs: number,
  seq: number,
  extra: Partial<NativeUsageRecord> = {}
): NativeUsageRecord {
  return {
    ...BASE,
    t: "interval",
    seq,
    kind,
    user_id: "44444444-4444-4444-8444-444444444444",
    start_wall: startMs,
    start_elapsed: startMs,
    end_wall: endMs,
    end_elapsed: endMs,
    ...extra,
  };
}

describe("deterministicId", () => {
  it("is stable, so a replayed drain cannot create a second row", () => {
    const a = deterministicId("dev", "sess", 4, "foreground", 0);
    const b = deterministicId("dev", "sess", 4, "foreground", 0);
    expect(a).toBe(b);
  });

  it("separates the halves of a midnight-split interval", () => {
    expect(deterministicId("dev", "sess", 4, "foreground", 0)).not.toBe(
      deterministicId("dev", "sess", 4, "foreground", 1)
    );
  });

  it("separates foreground from background at the same seq", () => {
    expect(deterministicId("dev", "sess", 4, "foreground", 0)).not.toBe(
      deterministicId("dev", "sess", 4, "background", 0)
    );
  });

  it("produces a syntactically valid v4-shaped uuid", () => {
    expect(deterministicId("a", "b", 1, "foreground", 0)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});

describe("splitAtLocalMidnight", () => {
  it("leaves an interval inside one day alone", () => {
    const slices = splitAtLocalMidnight(at(9, 0), at(9, 20));
    expect(slices).toHaveLength(1);
    expect(slices[0].date).toBe(localDateString(at(9, 0)));
  });

  it("splits 23:40 -> 00:20 into two days whose durations sum to the original", () => {
    const start = at(23, 40, 18);
    const end = at(0, 20, 19);
    const slices = splitAtLocalMidnight(start, end);
    expect(slices).toHaveLength(2);
    expect(slices[0].date).toBe("2026-09-18");
    expect(slices[1].date).toBe("2026-09-19");
    const total = slices.reduce((a, s) => a + (s.endMs - s.startMs), 0);
    expect(total).toBe(end - start);
  });

  it("returns nothing for an inverted pair", () => {
    expect(splitAtLocalMidnight(at(10, 0), at(9, 0))).toHaveLength(0);
  });
});

describe("mapRecordsToRows", () => {
  // The worked example: 9:00 open, 9:20 bg, 9:35 fg, 10:00 bg, 10:10 fg, 10:30 end.
  const worked: NativeUsageRecord[] = [
    { ...BASE, t: "process_start", wall: at(9, 0) },
    interval("foreground", at(9, 0), at(9, 20), 1),
    interval("background", at(9, 20), at(9, 35), 2),
    interval("foreground", at(9, 35), at(10, 0), 3),
    interval("background", at(10, 0), at(10, 10), 4),
    interval("foreground", at(10, 10), at(10, 30), 5),
  ];

  it("totals 65 minutes foreground and 25 minutes background", () => {
    const { intervals } = mapRecordsToRows(worked);
    const seconds = (kind: string) =>
      intervals
        .filter((i) => i.kind === kind)
        .reduce(
          (a, i) => a + (Date.parse(i.ended_at) - Date.parse(i.started_at)) / 1000,
          0
        );
    expect(seconds("foreground")).toBe(65 * 60);
    expect(seconds("background")).toBe(25 * 60);
  });

  it("never counts a background period as foreground", () => {
    const { intervals } = mapRecordsToRows(worked);
    const fg = intervals.filter((i) => i.kind === "foreground");
    expect(fg).toHaveLength(3);
    expect(fg.every((i) => Date.parse(i.ended_at) > Date.parse(i.started_at))).toBe(true);
  });

  it("emits exactly one session row for the batch, ahead of the intervals", () => {
    const { sessions } = mapRecordsToRows(worked);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(BASE.session_id);
    expect(sessions[0].started_at).toBe(new Date(at(9, 0)).toISOString());
  });

  it("drops intervals recorded while signed out instead of back-attributing them", () => {
    const records = [
      interval("foreground", at(9, 0), at(9, 10), 1, { user_id: null }),
      interval("foreground", at(9, 10), at(9, 20), 2),
    ];
    const { intervals, droppedUnattributed } = mapRecordsToRows(records);
    expect(droppedUnattributed).toBe(1);
    expect(intervals).toHaveLength(1);
  });

  it("splits an interval crossing local midnight into two dated rows", () => {
    const records = [interval("background", at(23, 40, 18), at(0, 20, 19), 7)];
    const { intervals } = mapRecordsToRows(records);
    expect(intervals).toHaveLength(2);
    expect(intervals.map((i) => i.date)).toEqual(["2026-09-18", "2026-09-19"]);
    expect(intervals.every((i) => i.is_midnight_split)).toBe(true);
    expect(intervals[0].end_reason).toBe("midnight_split");
    expect(intervals[1].start_reason).toBe("midnight_split");
    expect(new Set(intervals.map((i) => i.id)).size).toBe(2);
  });

  it("carries the confidence of a reconciled kill through to the row", () => {
    const records = [
      interval("background", at(10, 0), at(10, 5), 3, {
        source: "reconciled",
        end_confidence: "inferred",
        uncertainty_ms: 90_000,
        end_reason: "force_stop",
      }),
    ];
    const { intervals } = mapRecordsToRows(records);
    expect(intervals[0].source).toBe("reconciled");
    expect(intervals[0].end_confidence).toBe("inferred");
    expect(intervals[0].uncertainty_ms).toBe(90_000);
  });

  it("turns an exit record into a seal for the previous session", () => {
    const records: NativeUsageRecord[] = [
      {
        ...BASE,
        t: "exit",
        wall: at(10, 30),
        of_session: "55555555-5555-4555-8555-555555555555",
        end_reason: "force_stop",
        end_confidence: "exit_record",
        reason_code: 11,
        importance: 125,
        uncertainty_ms: 0,
      },
    ];
    const { seals } = mapRecordsToRows(records);
    expect(seals).toHaveLength(1);
    expect(seals[0]).toMatchObject({
      id: "55555555-5555-4555-8555-555555555555",
      status: "reconciled",
      end_reason: "force_stop",
      exit_reason_code: 11,
    });
  });

  it("rejects an unknown source rather than writing it through", () => {
    const records = [interval("foreground", at(9, 0), at(9, 5), 1, { source: "nonsense" })];
    expect(mapRecordsToRows(records).intervals[0].source).toBe("observed");
  });

  it("ignores an interval whose end precedes its start", () => {
    const records = [interval("foreground", at(10, 0), at(9, 0), 1)];
    expect(mapRecordsToRows(records).intervals).toHaveLength(0);
  });
});
