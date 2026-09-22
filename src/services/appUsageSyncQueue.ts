/**
 * Local buffer + batched upload for app-usage rows.
 *
 * Structurally a sibling of src/services/gpsSyncQueue.ts, and deliberately a
 * copy rather than a shared abstraction. That file is the live GPS upload path,
 * pinned by its own test suite and welded to its domain (table literal,
 * restart-continuity peek, capture-time date). Refactoring it to serve a new
 * feature would put the location trail at risk to save a few hundred lines. The
 * right time to extract a shared queue is after this one has been stable in
 * production for a release; gpsSyncQueue.test.ts is the safety net for that.
 *
 * Two intentional divergences from the GPS queue:
 *
 *  - It persists immediately after enqueuing a drained batch instead of on a
 *    3s debounce. The native drain has already moved the journal aside, so a
 *    process death inside a debounce window would lose the records outright --
 *    and losing one usage row loses a whole interval, not one fix out of
 *    thousands.
 *  - Rows are written in dependency order: sessions, then intervals (which have
 *    a foreign key onto them), then seals.
 */

import { supabase } from "@/integrations/supabase/client";
import { APP_USAGE_CONFIG } from "@/utils/appUsageConfig";
import type { UsageIntervalRow, UsageSessionRow, UsageSessionSeal } from "./appUsageReconcile";

const STORAGE_KEY = "app-usage-queue:v1";
const CFG = APP_USAGE_CONFIG.QUEUE;

interface QueueState {
  sessions: UsageSessionRow[];
  intervals: UsageIntervalRow[];
  seals: UsageSessionSeal[];
}

let queue: QueueState = { sessions: [], intervals: [], seals: [] };
let initialized = false;
let inFlight: Promise<{ remaining: number }> | null = null;
let consecutiveFailures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
/** Rows discarded by the hard cap, a foreign owner, or permanent rejection. */
let dropped = 0;
let lastFlushAt = Date.now();
let lastError: string | null = null;

function size(): number {
  return queue.sessions.length + queue.intervals.length + queue.seals.length;
}

function persistNow() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[appUsageSyncQueue] persist failed", e);
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Record<keyof QueueState, unknown>>;
    // Anything persisted by an older build is untrusted: keep only rows that
    // still carry the identity the server will insist on.
    const owned = <T extends { id?: string; user_id?: string }>(v: unknown): T[] =>
      Array.isArray(v) ? (v as T[]).filter((r) => !!r?.id && !!r?.user_id) : [];
    queue = {
      sessions: owned<UsageSessionRow>(parsed?.sessions),
      intervals: owned<UsageIntervalRow>(parsed?.intervals),
      seals: Array.isArray(parsed?.seals)
        ? (parsed.seals as UsageSessionSeal[]).filter((r) => !!r?.id)
        : [],
    };
  } catch {
    queue = { sessions: [], intervals: [], seals: [] };
  }
}

function backoffMs(): number {
  return Math.min(CFG.RETRY_BASE_MS * 2 ** consecutiveFailures, CFG.MAX_BACKOFF_MS);
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushPendingAppUsage();
  }, backoffMs());
}

/** Permission failures never resolve by retrying -- drop, don't block. */
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
 * Shared devices: the database only lets a user insert their own rows, so rows
 * left behind by a previously signed-in user would fail forever and block every
 * later row. Same failure mode, and same fix, as setGpsQueueOwner.
 */
export function setAppUsageQueueOwner(userId: string): void {
  const before = size();
  queue.sessions = queue.sessions.filter((r) => r.user_id === userId);
  queue.intervals = queue.intervals.filter((r) => r.user_id === userId);
  const removed = before - size();
  if (removed > 0) {
    dropped += removed;
    persistNow();
    console.warn(`[appUsageSyncQueue] dropped ${removed} rows belonging to a previous user`);
  }
}

type AnyRow = Record<string, unknown> & { id: string };

/**
 * The generated Database type will not know app_usage_* until types.ts is
 * regenerated, so the client has to be widened here. Kept to this one helper
 * rather than scattered through the file, and removable in one edit once the
 * types are refreshed.
 */
type UntypedSupabase = {
  from: (table: string) => {
    upsert: (
      rows: AnyRow[],
      opts: { onConflict: string; ignoreDuplicates: boolean }
    ) => Promise<{ error: { code?: string; message?: string } | null }>;
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => Promise<{ error: { code?: string; message?: string } | null }>;
      };
    };
  };
};

const db = supabase as unknown as UntypedSupabase;

async function uploadTable(table: string, rows: AnyRow[]): Promise<"ok" | "retry"> {
  while (rows.length > 0) {
    const chunk = rows.slice(0, CFG.CHUNK_SIZE);
    const { error } = await db
      .from(table)
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      if (isPermissionError(error)) {
        // Unacceptable to the server however often we retry: discard this
        // chunk (counted) and keep the rest of the queue moving.
        const sent = new Set(chunk.map((c) => c.id));
        for (let i = rows.length - 1; i >= 0; i--) if (sent.has(rows[i]!.id)) rows.splice(i, 1);
        dropped += chunk.length;
        persistNow();
        lastError = `rejected: ${error.message}`;
        console.warn(`[appUsageSyncQueue] dropped ${chunk.length} rejected ${table} rows`, error.message);
        continue;
      }
      consecutiveFailures++;
      lastError = error.message ?? null;
      scheduleRetry();
      return "retry";
    }
    const sent = new Set(chunk.map((c) => c.id));
    for (let i = rows.length - 1; i >= 0; i--) if (sent.has(rows[i]!.id)) rows.splice(i, 1);
    persistNow();
  }
  return "ok";
}

async function flushOnce(): Promise<{ remaining: number }> {
  // Order matters: intervals carry a foreign key onto sessions.
  if ((await uploadTable("app_usage_sessions", queue.sessions as unknown as AnyRow[])) === "retry") {
    return { remaining: size() };
  }
  if ((await uploadTable("app_usage_intervals", queue.intervals as unknown as AnyRow[])) === "retry") {
    return { remaining: size() };
  }

  // Seals are UPDATEs, so they go one at a time. They are rare (one per ended
  // session) and the policy's `status = 'open'` guard means a seal aimed at
  // someone else's session simply matches nothing rather than erroring.
  while (queue.seals.length > 0) {
    const seal = queue.seals[0]!;
    const { id, ...patch } = seal;
    const { error } = await db
      .from("app_usage_sessions")
      .update(patch)
      .eq("id", id)
      .eq("status", "open");
    if (error && !isPermissionError(error)) {
      consecutiveFailures++;
      lastError = error.message ?? null;
      scheduleRetry();
      return { remaining: size() };
    }
    if (error) dropped++;
    queue.seals.shift();
    persistNow();
  }

  lastFlushAt = Date.now();
  consecutiveFailures = 0;
  lastError = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  return { remaining: size() };
}

/** Single-flight coordinator: concurrent callers share one upload pass. */
export function flushPendingAppUsage(): Promise<{ remaining: number }> {
  if (size() === 0) return Promise.resolve({ remaining: 0 });
  if (inFlight) return inFlight;
  inFlight = flushOnce()
    .catch(() => ({ remaining: size() }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function enforceCap() {
  const overflow = size() - CFG.MAX_ROWS;
  if (overflow <= 0) return;
  // Pathological (multi-day offline) overflow. Drop the oldest intervals --
  // counted, never silent -- and keep sessions, which are cheap and are what
  // intervals depend on.
  const removed = queue.intervals.splice(0, Math.min(overflow, queue.intervals.length));
  dropped += removed.length;
  console.warn(`[appUsageSyncQueue] queue cap hit — dropped ${removed.length} oldest intervals (total ${dropped})`);
}

export function enqueueAppUsage(batch: {
  sessions: UsageSessionRow[];
  intervals: UsageIntervalRow[];
  seals: UsageSessionSeal[];
}): void {
  if (!batch.sessions.length && !batch.intervals.length && !batch.seals.length) return;
  queue.sessions.push(...batch.sessions);
  queue.intervals.push(...batch.intervals);
  queue.seals.push(...batch.seals);
  enforceCap();
  // Synchronous persist, not debounced: the native journal has already been
  // moved aside, so these rows exist nowhere else.
  persistNow();
}

export interface AppUsageQueueStats {
  pending: number;
  dropped: number;
  failures: number;
  lastError: string | null;
  lastFlushAt: number;
}

export function getAppUsageQueueStats(): AppUsageQueueStats {
  return {
    pending: size(),
    dropped,
    failures: consecutiveFailures,
    lastError,
    lastFlushAt,
  };
}

/** Load persisted rows and attach the flush triggers. Idempotent. */
export function initAppUsageSyncQueue(): void {
  if (initialized) return;
  initialized = true;
  lastFlushAt = Date.now();
  restore();

  intervalTimer = setInterval(() => void flushPendingAppUsage(), CFG.FLUSH_INTERVAL_MS);

  window.addEventListener("online", () => {
    consecutiveFailures = 0; // connectivity returned — retry immediately
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    void flushPendingAppUsage();
  });
}

/** Test hook: reset module state (not used by production code). */
export function __resetAppUsageQueueForTests(): void {
  queue = { sessions: [], intervals: [], seals: [] };
  initialized = false;
  inFlight = null;
  consecutiveFailures = 0;
  dropped = 0;
  lastFlushAt = Date.now();
  lastError = null;
  if (retryTimer) clearTimeout(retryTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  retryTimer = null;
  intervalTimer = null;
}
