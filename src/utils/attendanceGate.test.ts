import { describe, it, expect } from "vitest";
import { filterPointsByAttendance, type AttendanceRow } from "./attendanceGate";

const GRACE = 15 * 60 * 1000;

const T = (iso: string) => Date.parse(iso);

function pt(date: string, iso: string) {
  return { timestamp: iso, date };
}

const row = (
  date: string,
  checkIn: string | null,
  checkOut: string | null
): AttendanceRow => ({ date, check_in_time: checkIn, check_out_time: checkOut });

describe("filterPointsByAttendance", () => {
  it("keeps all points for a date with no attendance row (critical fallback)", () => {
    const points = [
      pt("2026-08-26", "2026-08-26T03:00:00Z"),
      pt("2026-08-26", "2026-08-26T15:00:00Z"),
    ];
    expect(filterPointsByAttendance(points, [], GRACE)).toHaveLength(2);
    // Other days' rows don't affect a day without its own row.
    const rows = [row("2026-08-25", "2026-08-25T04:00:00Z", "2026-08-25T12:00:00Z")];
    expect(filterPointsByAttendance(points, rows, GRACE)).toHaveLength(2);
  });

  it("honors the 15-minute grace on both ends", () => {
    const rows = [row("2026-08-26", "2026-08-26T04:00:00Z", "2026-08-26T12:00:00Z")];
    const points = [
      pt("2026-08-26", "2026-08-26T03:50:00Z"), // 10 min before check-in — kept
      pt("2026-08-26", "2026-08-26T03:40:00Z"), // 20 min before — dropped
      pt("2026-08-26", "2026-08-26T12:10:00Z"), // 10 min after checkout — kept
      pt("2026-08-26", "2026-08-26T12:20:00Z"), // 20 min after — dropped
    ];
    const kept = filterPointsByAttendance(points, rows, GRACE);
    expect(kept.map((p) => p.timestamp)).toEqual([
      "2026-08-26T03:50:00Z",
      "2026-08-26T12:10:00Z",
    ]);
  });

  it("an open session (no checkout) keeps everything after check-in", () => {
    const rows = [row("2026-08-26", "2026-08-26T04:00:00Z", null)];
    const points = [
      pt("2026-08-26", "2026-08-26T04:30:00Z"),
      pt("2026-08-26", "2026-08-26T23:00:00Z"),
    ];
    expect(filterPointsByAttendance(points, rows, GRACE)).toHaveLength(2);
  });

  it("an open prior-day session carries over past midnight", () => {
    const rows = [
      row("2026-08-26", "2026-08-26T10:00:00Z", null),
      row("2026-08-27", "2026-08-27T09:00:00Z", "2026-08-27T17:00:00Z"),
    ];
    // Point at 01:00 on the 27th: outside the 27th's own window, but the 26th's
    // session is still open ⇒ kept.
    const kept = filterPointsByAttendance(
      [pt("2026-08-27", "2026-08-27T01:00:00Z")],
      rows,
      GRACE
    );
    expect(kept).toHaveLength(1);
  });

  it("a CLOSED prior-day session no longer admits next-day points", () => {
    const rows = [
      row("2026-08-26", "2026-08-26T04:00:00Z", "2026-08-26T23:50:00Z"),
      row("2026-08-27", "2026-08-27T09:00:00Z", "2026-08-27T17:00:00Z"),
    ];
    // 01:00 on the 27th sits inside no 27th window; the 26th closed ⇒ dropped.
    // (Under the old flat-window logic the 26th's window would have leaked.)
    const kept = filterPointsByAttendance(
      [pt("2026-08-27", "2026-08-27T01:00:00Z")],
      rows,
      GRACE
    );
    expect(kept).toHaveLength(0);
  });

  it("multiple sessions on one day are a union of windows; overlaps never duplicate", () => {
    const rows = [
      row("2026-08-26", "2026-08-26T04:00:00Z", "2026-08-26T08:00:00Z"),
      row("2026-08-26", "2026-08-26T07:30:00Z", "2026-08-26T12:00:00Z"), // overlaps
    ];
    const points = [
      pt("2026-08-26", "2026-08-26T05:00:00Z"), // session 1
      pt("2026-08-26", "2026-08-26T07:45:00Z"), // inside BOTH windows
      pt("2026-08-26", "2026-08-26T11:00:00Z"), // session 2
      pt("2026-08-26", "2026-08-26T22:00:00Z"), // neither
    ];
    const kept = filterPointsByAttendance(points, rows, GRACE);
    expect(kept).toHaveLength(3); // the overlap point appears exactly once
  });

  it("rows without check_in_time are ignored (day treated as no-attendance)", () => {
    const rows = [row("2026-08-26", null, null)];
    const kept = filterPointsByAttendance(
      [pt("2026-08-26", "2026-08-26T02:00:00Z")],
      rows,
      GRACE
    );
    expect(kept).toHaveLength(1);
  });

  it("grace boundary math is exact", () => {
    const rows = [row("2026-08-26", "2026-08-26T04:00:00Z", null)];
    const boundary = T("2026-08-26T04:00:00Z") - GRACE;
    const kept = filterPointsByAttendance(
      [
        { timestamp: new Date(boundary).toISOString(), date: "2026-08-26" },
        { timestamp: new Date(boundary - 1000).toISOString(), date: "2026-08-26" },
      ],
      rows,
      GRACE
    );
    expect(kept).toHaveLength(1);
  });
});
