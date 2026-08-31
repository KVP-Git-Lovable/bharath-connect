/**
 * Attendance-window gating for GPS points (Day Tracking).
 *
 * Source of truth for tracking windows is the `attendance` table
 * (check_in_time / check_out_time) — activity_sessions is unused.
 *
 * Rules (preserving the Aug-27/28 fixes):
 *  - A point whose date has NO attendance row is kept unconditionally —
 *    missing attendance must never blank the trail.
 *  - A grace window absorbs the minutes between the first location fix and
 *    the check-in write (and the same at check-out).
 *  - An open session (no checkout) extends to infinity, and still admits
 *    next-day points (overnight shifts) via the carryover rule.
 *  - Windows are date-scoped: a CLOSED session on day A can no longer admit
 *    day-B points (that leak was a bug); multiple sessions on one day are a
 *    union of that day's windows, and a point is only ever kept or dropped —
 *    never duplicated — so overlapping windows cannot double-count.
 */

import { GPS_PROCESSING_CONFIG } from "@/utils/gpsDistance";

export interface AttendanceRow {
  date: string; // yyyy-MM-dd
  check_in_time: string | null;
  check_out_time: string | null;
}

interface Window {
  start: number;
  end: number; // Infinity for an open session
}

function prevDateStr(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function filterPointsByAttendance<
  P extends { timestamp: string; date?: string }
>(
  points: P[],
  attendanceRows: AttendanceRow[],
  graceMs: number = GPS_PROCESSING_CONFIG.SESSION_GRACE_MS
): P[] {
  const windowsByDate = new Map<string, Window[]>();
  for (const a of attendanceRows) {
    if (!a.check_in_time) continue;
    const start = new Date(a.check_in_time).getTime() - graceMs;
    const end = a.check_out_time
      ? new Date(a.check_out_time).getTime() + graceMs
      : Infinity;
    const list = windowsByDate.get(a.date);
    if (list) list.push({ start, end });
    else windowsByDate.set(a.date, [{ start, end }]);
  }

  const isInActiveSession = (p: { timestamp: string; date?: string }): boolean => {
    // Missing attendance for the day ⇒ keep the day's points (critical fallback).
    if (!p.date || !windowsByDate.has(p.date)) return true;
    const t = new Date(p.timestamp).getTime();
    const own = windowsByDate.get(p.date)!;
    if (own.some((w) => t >= w.start && t <= w.end)) return true;
    // Overnight carryover: an OPEN session started the previous date still
    // covers points after midnight. Closed prior-day sessions do not leak.
    const prev = windowsByDate.get(prevDateStr(p.date));
    return !!prev?.some((w) => w.end === Infinity && t >= w.start);
  };

  return points.filter(isInActiveSession);
}
