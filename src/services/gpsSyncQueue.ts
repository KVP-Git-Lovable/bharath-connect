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
let lastFlushAt = 0;


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

function persistDebounced() {
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, CFG.PERSIST_DEBOUNCE_MS);
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

/** Permission failures never resolve by retrying — drop, don't block. */
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
    droppedPoints += removed;
    persistNow();
    console.warn(`[gpsSyncQueue] dropped ${removed} queued points belonging to a previous user`);
  }
}


async function flushOnce(): Promise<{ remaining: number }> {
  await dropForeignUserPoints();
  while (queue.length > 0) {
    const chunk = queue.slice(0, CFG.CHUNK_SIZE);
    const { error } = await supabase
      .from("gps_tracking")
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      if (isPermissionError(error)) {
        // Unacceptable to the server no matter how often we retry — discard
        // this chunk (counted) and keep the rest of the queue moving.
        const sent = new Set(chunk.map((c) => c.id));
        queue = queue.filter((p) => !sent.has(p.id));
        droppedPoints += chunk.length;
        persistNow();
        console.warn(`[gpsSyncQueue] dropped ${chunk.length} rejected points`, error.message);
        continue;
      }
      consecutiveFailures++;
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
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
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
      const overflow = queue.length - CFG.MAX_POINTS;
      queue.splice(0, overflow);
      droppedPoints += overflow;
      console.warn(`[gpsSyncQueue] queue cap hit — dropped ${overflow} oldest points (total ${droppedPoints})`);
    }
  }
  persistDebounced();
  // Batch trigger, plus a freshness trigger: after a quiet spell send the
  // point straight away so live/admin views aren't a full interval behind.
  if (queue.length >= CFG.BATCH_SIZE || Date.now() - lastFlushAt >= CFG.IDLE_FLUSH_MS) {
    void flushPendingGpsPoints();
  }
}


export function getQueueSize(): number {
  return queue.length;
}

export function getDroppedPointCount(): number {
  return droppedPoints;
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
  restore();

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
  lastFlushAt = 0;

  if (retryTimer) clearTimeout(retryTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  if (persistTimer) clearTimeout(persistTimer);
  retryTimer = intervalTimer = null;
  persistTimer = null;
}
