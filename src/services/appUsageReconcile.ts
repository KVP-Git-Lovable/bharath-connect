/**
 * Pure translation from native journal records to database rows.
 *
 * Everything here is deterministic and side-effect free so it can be tested
 * without a device, which matters: these are the rules that decide whether a
 * user's reported time is right.
 *
 * Three of those rules are load-bearing:
 *
 *  1. Row ids are DERIVED, not random. A drain that is replayed (the two-phase
 *     native drain, a StrictMode double-mount, a retried upload) produces the
 *     same id, so ON CONFLICT DO NOTHING makes double-counting structurally
 *     impossible rather than merely unlikely. This is the single detail most
 *     likely to be got wrong and least likely to be noticed.
 *  2. Intervals are split at LOCAL midnight. A GPS fix is a point, so stamping
 *     it with a day works; an interval is a duration, and one running
 *     23:40 -> 00:20 belongs to two days. Stamping it with the start day would
 *     systematically inflate day N and starve day N+1, specifically for
 *     late-evening usage.
 *  3. An interval with no user is DROPPED, never back-attributed. On a shared
 *     handset, giving pre-login time to whoever signs in next is an invented
 *     fact.
 */

export interface NativeUsageRecord {
  v: number;
  t: "interval" | "process_start" | "identity" | "exit";
  session_id: string | null;
  device_id: string | null;
  boot_id: string | null;
  wall: number;
  elapsed: number;
  app_version: string | null;
  os_version: string | null;
  device_model: string | null;
  platform: string | null;
  // interval only
  seq?: number;
  kind?: "foreground" | "background";
  user_id?: string | null;
  start_wall?: number;
  start_elapsed?: number;
  end_wall?: number;
  end_elapsed?: number;
  duration_ms?: number;
  interactive_ms?: number;
  coalesced_count?: number;
  source?: string;
  end_confidence?: string;
  uncertainty_ms?: number;
  start_reason?: string;
  end_reason?: string;
  clock_jump_ms?: number;
  gps_service_recent?: boolean;
  // exit only
  of_session?: string;
  of_pid?: number;
  reason_code?: number;
  importance?: number;
}

export interface UsageSessionRow {
  id: string;
  user_id: string;
  device_id: string;
  started_at: string;
  date: string;
  tz_offset_minutes: number;
  status: string;
  app_version: string | null;
  os_version: string | null;
  device_model: string | null;
  platform: string;
  boot_id: string | null;
  source: string;
}

export interface UsageIntervalRow {
  id: string;
  session_id: string;
  user_id: string;
  device_id: string;
  seq: number;
  kind: "foreground" | "background";
  started_at: string;
  ended_at: string;
  date: string;
  tz_offset_minutes: number;
  interactive_ms: number | null;
  coalesced_count: number;
  source: string;
  end_confidence: string;
  uncertainty_ms: number;
  start_reason: string | null;
  end_reason: string | null;
  is_midnight_split: boolean;
  gps_service_recent: boolean | null;
  clock_jump_ms: number;
  boot_id: string | null;
  app_version: string | null;
  os_version: string | null;
}

export interface UsageSessionSeal {
  id: string;
  ended_at: string;
  status: string;
  end_reason: string;
  end_confidence: string | null;
  exit_reason_code: number | null;
  exit_importance: number | null;
  uncertainty_ms: number;
}

export interface MappedUsage {
  sessions: UsageSessionRow[];
  intervals: UsageIntervalRow[];
  seals: UsageSessionSeal[];
  /** Intervals discarded because no user was signed in when they happened. */
  droppedUnattributed: number;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(input: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/**
 * A UUID-shaped digest of the parts. Not cryptographic and not meant to be --
 * it only has to be stable and collision-free across one device's own rows.
 * Deliberately synchronous: crypto.subtle is async and unavailable on
 * non-secure origins in some Android WebViews.
 */
export function deterministicId(...parts: (string | number | null | undefined)[]): string {
  const seed = parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|");
  const hex = [0, 1, 2, 3]
    .map((i) => fnv1a(`${i}:${seed}:${i}`).toString(16).padStart(8, "0"))
    .join("");
  // Force the version (4) and variant nibbles so the value is a legal uuid.
  const v = `${hex.slice(0, 12)}4${hex.slice(13, 16)}`;
  const variantNibble = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${variantNibble}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Local yyyy-MM-dd, matching how gps_tracking.date is computed at capture. */
export function localDateString(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Conventional UTC offset in minutes (IST = +330), not JS's inverted sign. */
export function tzOffsetMinutes(ms: number): number {
  return -new Date(ms).getTimezoneOffset();
}

function nextLocalMidnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export interface DaySlice {
  startMs: number;
  endMs: number;
  date: string;
  tzOffsetMinutes: number;
  dayIndex: number;
}

/**
 * Split [startMs, endMs] at every local midnight it crosses. Durations of the
 * parts sum exactly to the original, and each part sits inside one local day so
 * aggregation is a plain GROUP BY with no timezone logic in the read path.
 */
export function splitAtLocalMidnight(startMs: number, endMs: number): DaySlice[] {
  const slices: DaySlice[] = [];
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return slices;

  let cursor = startMs;
  let dayIndex = 0;
  // Guard against a nonsense timestamp pair producing an unbounded loop.
  while (dayIndex < 400) {
    const boundary = nextLocalMidnight(cursor);
    const end = Math.min(boundary, endMs);
    slices.push({
      startMs: cursor,
      endMs: end,
      date: localDateString(cursor),
      tzOffsetMinutes: tzOffsetMinutes(cursor),
      dayIndex,
    });
    if (end >= endMs) break;
    cursor = end;
    dayIndex++;
  }
  return slices;
}

const VALID_SOURCES = new Set(["observed", "heartbeat", "reconciled", "web"]);
const VALID_CONFIDENCE = new Set(["observed", "exit_record", "inferred"]);

/**
 * Translate a drained batch of journal records into rows.
 *
 * Sessions are emitted for every interval we keep, built from the matching
 * process_start when it is in the same batch and synthesised from the interval
 * otherwise (the real one was uploaded in an earlier batch, and the upsert's
 * ignoreDuplicates keeps it). That ordering -- sessions before intervals --
 * is what stops the interval insert tripping its foreign key.
 */
export function mapRecordsToRows(records: NativeUsageRecord[]): MappedUsage {
  const sessions = new Map<string, UsageSessionRow>();
  const intervals: UsageIntervalRow[] = [];
  const seals: UsageSessionSeal[] = [];
  let droppedUnattributed = 0;

  const starts = new Map<string, NativeUsageRecord>();
  for (const r of records) {
    if (r?.t === "process_start" && r.session_id) starts.set(r.session_id, r);
  }

  for (const r of records) {
    if (!r || r.t !== "interval") continue;
    if (!r.session_id || !r.device_id) continue;
    if (!r.user_id) {
      // Recorded before anyone signed in. Never back-attributed.
      droppedUnattributed++;
      continue;
    }

    const startMs = Number(r.start_wall ?? 0);
    const endMs = Number(r.end_wall ?? 0);
    if (!startMs || endMs < startMs) continue;
    const kind = r.kind === "background" ? "background" : "foreground";

    if (!sessions.has(r.session_id)) {
      const ps = starts.get(r.session_id);
      const sessionStart = Number(ps?.wall ?? startMs);
      sessions.set(r.session_id, {
        id: r.session_id,
        user_id: r.user_id,
        device_id: r.device_id,
        started_at: new Date(sessionStart).toISOString(),
        date: localDateString(sessionStart),
        tz_offset_minutes: tzOffsetMinutes(sessionStart),
        status: "open",
        app_version: r.app_version ?? ps?.app_version ?? null,
        os_version: r.os_version ?? ps?.os_version ?? null,
        device_model: r.device_model ?? ps?.device_model ?? null,
        platform: r.platform ?? "android",
        boot_id: r.boot_id ?? null,
        source: r.platform === "web" ? "web" : "native",
      });
    }

    const slices = splitAtLocalMidnight(startMs, endMs);
    const split = slices.length > 1;
    for (const slice of slices) {
      intervals.push({
        // (session, seq, kind, day) is unique by construction and matches the
        // table's own unique constraint.
        id: deterministicId(r.device_id, r.session_id, r.seq ?? 0, kind, slice.dayIndex),
        session_id: r.session_id,
        user_id: r.user_id,
        device_id: r.device_id,
        seq: Number(r.seq ?? 1),
        kind,
        started_at: new Date(slice.startMs).toISOString(),
        ended_at: new Date(slice.endMs).toISOString(),
        date: slice.date,
        tz_offset_minutes: slice.tzOffsetMinutes,
        interactive_ms: kind === "foreground" ? Number(r.interactive_ms ?? 0) : null,
        coalesced_count: Number(r.coalesced_count ?? 0),
        source: VALID_SOURCES.has(String(r.source)) ? String(r.source) : "observed",
        end_confidence: VALID_CONFIDENCE.has(String(r.end_confidence))
          ? String(r.end_confidence)
          : "observed",
        uncertainty_ms: Number(r.uncertainty_ms ?? 0),
        start_reason: split && slice.dayIndex > 0 ? "midnight_split" : (r.start_reason ?? null),
        end_reason:
          split && slice.dayIndex < slices.length - 1 ? "midnight_split" : (r.end_reason ?? null),
        is_midnight_split: split,
        gps_service_recent: r.gps_service_recent ?? null,
        clock_jump_ms: Number(r.clock_jump_ms ?? 0),
        boot_id: r.boot_id ?? null,
        app_version: r.app_version ?? null,
        os_version: r.os_version ?? null,
      });
    }
  }

  for (const r of records) {
    if (!r || r.t !== "exit" || !r.of_session) continue;
    seals.push({
      id: r.of_session,
      ended_at: new Date(Number(r.wall ?? Date.now())).toISOString(),
      status: "reconciled",
      end_reason: r.end_reason ?? "unknown",
      end_confidence: VALID_CONFIDENCE.has(String(r.end_confidence))
        ? String(r.end_confidence)
        : "inferred",
      exit_reason_code: r.reason_code ?? null,
      exit_importance: r.importance ?? null,
      uncertainty_ms: Number(r.uncertainty_ms ?? 0),
    });
  }

  return { sessions: [...sessions.values()], intervals, seals, droppedUnattributed };
}
