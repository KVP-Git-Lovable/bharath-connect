/**
 * Local GPS buffer + single batched sync coordinator.
 *
 * Battery/network policy: GPS fixes are NEVER uploaded one-by-one. They are
 * enqueued synchronously here, persisted to localStorage (survives
 * backgrounding, screen-off, and app kill), and uploaded in idempotent
 * batches by exactly one in-flight flush at a time:
 *
 *   GPS fix → local buffer → (batch size | interval | online | resume |
 *   explicit flush) → chunked upsert → remove acknowledged points
 *
 * Rules:
 *  - GPS collection is independent of the network: a failed upload keeps
 *    every point queued and backs off exponentially; it never touches
 *    acquisition.
 *  - A point leaves the queue only after the server acknowledged its batch.
 *  - Each point carries a client-generated UUID and is upserted with
 *    ON CONFLICT DO NOTHING, so a retry after a timed-out-but-received
 *    request cannot create duplicate rows.
 */

import { supabase } from "@/integrations/supabase/client";
import { GPS_CAPTURE_CONFIG } from "@/utils/gpsCaptureGate";
import { logTrackerEvent } from "@/services/trackerHealth";

export interface QueuedGpsPoint {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string; // ISO capture time
  date: string; // yyyy-MM-dd computed at capture (midnight-safe)
}

const STORAGE_KEY = "gps-sync-queue:v1";
/** Points set aside after repeated real rejections — kept, never deleted. */
const QUARANTINE_KEY = "gps-sync-queue:quarantine:v1";
/** Oldest points spilled here when the main queue hits its cap. */
const OVERFLOW_KEY = "gps-sync-queue:overflow:v1";
/** Event fired whenever points are set aside or genuinely lost (UI warning). */
export const GPS_QUEUE_WARNING_EVENT = "gps-queue-warning";
/** Permission-looking failures retried (after a session refresh) before set-aside. */
const MAX_AUTH_RETRIES = 3;
const CFG = GPS_CAPTURE_CONFIG.QUEUE;

let queue: QueuedGpsPoint[] = [];
let initialized = false;
let inFlight: Promise<{ remaining: number }> | null = null;
let consecutiveFailures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
/** Points dropped by the hard cap or by permanent rejection — never silent. */
let droppedPoints = 0;
/** Timestamp of the last acknowledged upload (freshness/idle-flush trigger). */
let lastFlushAt = Date.now();
/** Last upload error message (diagnostics — "capture works, sync stuck"). */
let lastError: string | null = null;
/** Consecutive permission-looking failures for the head chunk. */
let authFailures = 0;
/** Points set aside (quarantined/spilled) — still on the device, not lost. */
let setAsidePoints = 0;

function readList(key: string): QueuedGpsPoint[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Append to a side store. Returns false only if the device refused to save. */
function appendList(key: string, pts: QueuedGpsPoint[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify([...readList(key), ...pts]));
    return true;
  } catch {
    return false;
  }
}

function warn(kind: "set_aside" | "dropped", count: number, detail: string, userId?: string) {
  console.warn(`[gpsSyncQueue] ${kind}: ${count} points — ${detail}`);
  if (userId) {
    void logTrackerEvent(userId, "gps_points_discarded", { kind, count, detail });
  }
  try {
    window.dispatchEvent(
      new CustomEvent(GPS_QUEUE_WARNING_EVENT, { detail: { kind, count, detail } })
    );
  } catch { /* non-DOM */ }
}


function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[gpsSyncQueue] persist failed", e);
  }
}


const IMMEDIATE_PERSIST_LIMIT = 1_000;
function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, 1_000);
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) queue = parsed.filter((p) => p && p.id && p.user_id);
  } catch {
    queue = [];
  }
}

function backoffMs(): number {
  return Math.min(CFG.RETRY_BASE_MS * 2 ** consecutiveFailures, CFG.MAX_BACKOFF_MS);
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushPendingGpsPoints();
  }, backoffMs());
}

/**
 * Permission-looking failures. PGRST301 / expired-JWT style errors are usually
 * a stale token, so they are retried after a session refresh before the chunk
 * is set aside (never deleted).
 */
function isPermissionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  return (
    code === "42501" ||
    code === "PGRST301" ||
    /row-level security|permission denied|violates row-level/i.test(error.message ?? "")
  );
}

/**
 * Shared devices: the queue is a single local buffer, but the database only
 * lets a user insert their own rows. Points left behind by a previously
 * signed-in user would fail forever and block every later point — so the
 * tracker declares the current owner and any foreign point is dropped
 * (counted, never silent). Synchronous by design: the flush path must not
 * gain an extra await before the upload.
 */
export function setGpsQueueOwner(userId: string): void {
  const before = queue.length;
  queue = queue.filter((p) => p.user_id === userId);
  const removed = before - queue.length;
  if (removed > 0) {
    // Another user's points can never upload under this account; they are
    // not this user's data. Counted and logged as before.
    droppedPoints += removed;
    persistNow();
    console.warn(`[gpsSyncQueue] dropped ${removed} queued points belonging to a previous user`);
  }
}


async function flushOnce(): Promise<{ remaining: number }> {
  
  while (queue.length > 0) {
    const chunk = queue.slice(0, CFG.CHUNK_SIZE);
    const { error } = await supabase
      .from("gps_tracking")
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      if (isPermissionError(error)) {
        authFailures++;
        lastError = `rejected (attempt ${authFailures}): ${error.message}`;
        if (authFailures < MAX_AUTH_RETRIES) {
          // Most often a stale/expired token: refresh the session and retry
          // with backoff. The chunk stays queued.
          try { await supabase.auth.refreshSession(); } catch { /* offline */ }
          consecutiveFailures++;
          scheduleRetry();
          return { remaining: queue.length };
        }
        // Repeated real rejection: move the chunk aside (kept on the device,
        // re-tried on next start) so it can't block newer points.
        const sent = new Set(chunk.map((c) => c.id));
        queue = queue.filter((p) => !sent.has(p.id));
        authFailures = 0;
        if (appendList(QUARANTINE_KEY, chunk)) {
          setAsidePoints += chunk.length;
          warn("set_aside", chunk.length, `upload refused: ${error.message}`, chunk[0]?.user_id);
        } else {
          droppedPoints += chunk.length;
          warn("dropped", chunk.length, "device storage full", chunk[0]?.user_id);
        }
        persistNow();
        continue;
      }
      consecutiveFailures++;
      lastError = error.message;
      scheduleRetry();
      if (import.meta.env.DEV) {
        console.warn(
          `[gpsSyncQueue] batch failed (${queue.length} pending, retry in ~${Math.round(backoffMs() / 1000)}s)`,
          error.message
        );
      }
      return { remaining: queue.length };
    }
    // Acknowledged — only now do the points leave the queue.
    const sent = new Set(chunk.map((c) => c.id));
    queue = queue.filter((p) => !sent.has(p.id));
    persistNow();
    lastFlushAt = Date.now();
    consecutiveFailures = 0;
    authFailures = 0;
    lastError = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }
  if (setAsidePoints > 0) {
    reloadSideStores(false);
    if (queue.length > 0) return flushOnce();
  }
  return { remaining: 0 };
}


/**
 * Single-flight coordinator: concurrent callers share one upload pass, plus
 * one follow-up pass so points enqueued mid-flush still drain.
 */
export function flushPendingGpsPoints(): Promise<{ remaining: number }> {
  if (queue.length === 0) return Promise.resolve({ remaining: 0 });
  if (inFlight) return inFlight;
  inFlight = flushOnce()
    .catch(() => ({ remaining: queue.length }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Old-WebView fallback (RFC4122-shaped, uniqueness is all we need here)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Synchronous enqueue — capture must never wait on the network. */
export function enqueueGpsPoint(p: Omit<QueuedGpsPoint, "id">): void {
  queue.push({ ...p, id: newId() });
  if (queue.length > CFG.MAX_POINTS) {
    // Pathological (multi-day offline) overflow: try to flush; if the network
    // is still down, drop the oldest — counted, never silent.
    void flushPendingGpsPoints();
    if (queue.length > CFG.MAX_POINTS) {
      // Spill the oldest to a side store instead of discarding them; they
      // re-enter the queue once it drains.
      const overflow = queue.length - CFG.MAX_POINTS;
      const spilled = queue.splice(0, overflow);
      if (appendList(OVERFLOW_KEY, spilled)) {
        setAsidePoints += spilled.length;
      } else {
        droppedPoints += spilled.length;
        warn("dropped", spilled.length, "device storage full — oldest points lost", spilled[0]?.user_id);
      }
    }
  }
  // Save on every point (was a 3 s debounce) so an app kill can't lose the
  // last few seconds of fixes. Only a very large offline backlog falls back
  // to a short 1 s debounce, to keep saving cheap.
  if (queue.length <= IMMEDIATE_PERSIST_LIMIT) persistNow();
  else persistSoon();
  // Batch trigger, plus a freshness trigger: after a quiet spell send the
  // point straight away so live/admin views aren't a full interval behind.
  if (queue.length >= CFG.BATCH_SIZE || Date.now() - lastFlushAt >= CFG.IDLE_FLUSH_MS) {
    void flushPendingGpsPoints();
  }
}


export function getQueueSize(): number {
  return queue.length;
}

/**
 * Move spilled + quarantined points back into the queue (overflow first when
 * there is room; quarantine once per start so a fixed permission recovers).
 */
function reloadSideStores(includeQuarantine: boolean) {
  const room = CFG.MAX_POINTS - queue.length;
  if (room <= 0) return;
  const keys = includeQuarantine ? [OVERFLOW_KEY, QUARANTINE_KEY] : [OVERFLOW_KEY];
  let space = room;
  for (const key of keys) {
    if (space <= 0) break;
    const list = readList(key);
    if (list.length === 0) continue;
    const take = list.slice(0, space);
    const rest = list.slice(take.length);
    const have = new Set(queue.map((p) => p.id));
    queue.unshift(...take.filter((p) => !have.has(p.id)));
    space -= take.length;
    setAsidePoints = Math.max(0, setAsidePoints - take.length);
    try {
      if (rest.length) localStorage.setItem(key, JSON.stringify(rest));
      else localStorage.removeItem(key);
    } catch { /* keep going */ }
  }
  queue.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  persistNow();
}

export function getSetAsidePointCount(): number {
  return setAsidePoints;
}

export function getDroppedPointCount(): number {
  return droppedPoints;
}

export interface GpsQueueStats {
  /** Points captured locally but not yet acknowledged by the server. */
  pending: number;
  /** Points discarded (hard cap, foreign user, or permanent rejection). */
  dropped: number;
  /** Points kept aside on the device (overflow / refused uploads). */
  setAside: number;
  /** Consecutive failed upload attempts (0 when healthy). */
  failures: number;
  /** Message of the last upload failure, cleared on the next success. */
  lastError: string | null;
  /** Epoch ms of the last acknowledged upload. */
  lastFlushAt: number;
}

/**
 * Observability for the "capture works but sync is stuck" case — surfaced in
 * the Day Tracking diagnostics so it can be read on the device without
 * attaching DevTools.
 */
export function getGpsQueueStats(): GpsQueueStats {
  return {
    pending: queue.length,
    dropped: droppedPoints,
    setAside: setAsidePoints,
    failures: consecutiveFailures,
    lastError,
    lastFlushAt,
  };
}

/** Newest locally queued point for a user/date — restart continuity. */
export function peekNewestQueuedPoint(userId: string, date: string): QueuedGpsPoint | null {
  let newest: QueuedGpsPoint | null = null;
  for (const p of queue) {
    if (p.user_id !== userId || p.date !== date) continue;
    if (!newest || Date.parse(p.timestamp) > Date.parse(newest.timestamp)) newest = p;
  }
  return newest;
}

/** Load persisted points and attach the flush triggers. Idempotent. */
export function initGpsSyncQueue(): void {
  if (initialized) return;
  initialized = true;
  lastFlushAt = Date.now();
  restore();
  setAsidePoints = readList(OVERFLOW_KEY).length + readList(QUARANTINE_KEY).length;
  reloadSideStores(true);

  // Best-effort interval flush (timers can be throttled while backgrounded;
  // the batch-size trigger rides native watcher callbacks and covers that).
  intervalTimer = setInterval(() => void flushPendingGpsPoints(), CFG.FLUSH_INTERVAL_MS);

  window.addEventListener("online", () => {
    consecutiveFailures = 0; // connectivity returned — retry immediately
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    void flushPendingGpsPoints();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistNow();
    else void flushPendingGpsPoints();
  });

  // App pause/resume on native (dynamic import; no-op on web).
  import("@capacitor/app")
    .then(({ App }) => {
      App.addListener("pause", () => persistNow());
      App.addListener("resume", () => void flushPendingGpsPoints());
    })
    .catch(() => {
      /* web — visibilitychange covers it */
    });
}

/** Test hook: reset module state (not used by production code). */
export function __resetGpsSyncQueueForTests(): void {
  queue = [];
  initialized = false;
  inFlight = null;
  consecutiveFailures = 0;
  droppedPoints = 0;
  setAsidePoints = 0;
  authFailures = 0;
  lastFlushAt = Date.now();
  lastError = null;

  if (retryTimer) clearTimeout(retryTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  if (persistTimer) clearTimeout(persistTimer);
  retryTimer = intervalTimer = null;
  persistTimer = null;
}
