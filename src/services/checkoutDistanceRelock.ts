/**
 * Check-out distance safety net.
 *
 * 1. flushWithRetry: drain the local GPS queue with a short, bounded retry so
 *    the locked distance includes the tail of the day.
 * 2. scheduleDistanceRelock: if points were still waiting at check-out, the
 *    distance is locked with what arrived, and recomputed ONCE (same engine,
 *    same window) after the late points have uploaded. The stored value only
 *    ever grows from that recompute — a short value no longer stays permanent.
 */
import { supabase } from "@/integrations/supabase/client";
import { flushPendingGpsPoints, getQueueSize } from "@/services/gpsSyncQueue";

const RELOCK_KEY = "gps-checkout-relock:v1";
const RELOCK_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface RelockJob {
  attendanceId: string;
  userId: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  createdAt?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Flush, retrying until empty or the time budget runs out. Returns points left. */
export async function flushWithRetry(budgetMs: number): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let delay = 500;
  for (;;) {
    try {
      await flushPendingGpsPoints();
    } catch { /* counted by the queue */ }
    const left = getQueueSize();
    if (left === 0 || Date.now() + delay > deadline) return left;
    await sleep(delay);
    delay = Math.min(delay * 2, 4000);
  }
}

function readJobs(): RelockJob[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RELOCK_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJobs(jobs: RelockJob[]) {
  try {
    if (jobs.length) localStorage.setItem(RELOCK_KEY, JSON.stringify(jobs));
    else localStorage.removeItem(RELOCK_KEY);
  } catch { /* storage full — job retried in memory this session */ }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function scheduleDistanceRelock(job: RelockJob): void {
  const jobs = readJobs().filter((j) => j.attendanceId !== job.attendanceId);
  jobs.push({ ...job, createdAt: Date.now() });
  writeJobs(jobs);
  startRelockLoop();
}

/** One-time recompute for one job. Returns true when the job is finished. */
export async function runRelockJob(job: RelockJob): Promise<boolean> {
  const { data: track, error } = await supabase
    .from("gps_tracking")
    .select("latitude, longitude, timestamp, accuracy, speed, heading")
    .eq("user_id", job.userId)
    .eq("date", job.date)
    .order("timestamp", { ascending: true });
  if (error) return false;
  if (!track || track.length < 2) return true;
  const { computeSnappedDistanceKm } = await import("@/utils/gpsDistance");
  const result = await computeSnappedDistanceKm(track as any, {
    checkInTime: job.checkInTime,
    checkOutTime: job.checkOutTime,
  });
  const km = Math.round(result.totalKm * 100) / 100;
  const { data: row } = await supabase
    .from("attendance")
    .select("total_distance_km")
    .eq("id", job.attendanceId)
    .maybeSingle();
  const current = Number(row?.total_distance_km ?? 0);
  if (km > current) {
    const { error: upErr } = await supabase
      .from("attendance")
      .update({ total_distance_km: km })
      .eq("id", job.attendanceId);
    if (upErr) return false;
    console.info(`[Attendance] distance re-locked after late GPS upload: ${current} → ${km} km`);
  }
  return true;
}

async function tick() {
  if (getQueueSize() > 0) {
    void flushPendingGpsPoints();
    return; // wait until the late points have actually uploaded
  }
  const jobs = readJobs();
  const keep: RelockJob[] = [];
  for (const job of jobs) {
    if (Date.now() - (job.createdAt ?? 0) > RELOCK_MAX_AGE_MS) continue;
    let done = false;
    try {
      done = await runRelockJob(job);
    } catch { /* retry next tick */ }
    if (!done) keep.push(job);
  }
  writeJobs(keep);
  if (keep.length === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Resume pending relock jobs (call at startup). Idempotent. */
export function startRelockLoop(): void {
  if (timer || typeof window === "undefined") return;
  if (readJobs().length === 0) return;
  timer = setInterval(() => void tick(), 30_000);
  void tick();
}
