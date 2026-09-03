/**
 * In-memory, UI-facing view of the GPS tracker's health.
 *
 * The 2 Sep investigation needed database forensics to answer "was the app
 * even capturing?". This lets the user see the same answer on the device:
 * whether tracking is active, when the last fix landed, and whether the
 * native watcher is alive.
 */
export interface TrackerStatus {
  /** Attendance day open and acquisition running. */
  active: boolean;
  /** Native background watcher registered (native builds only). */
  watcherAlive: boolean;
  /** Epoch ms of the last accepted fix, or null. */
  lastFixAt: number | null;
  /** Epoch ms of the last watcher/probe callback of any kind. */
  lastCallbackAt: number | null;
  native: boolean;
}

const STATUS_EVENT = "gps-tracker-status";

let status: TrackerStatus = {
  active: false,
  watcherAlive: false,
  lastFixAt: null,
  lastCallbackAt: null,
  native: false,
};

export function getTrackerStatus(): TrackerStatus {
  return status;
}

export function setTrackerStatus(patch: Partial<TrackerStatus>): void {
  status = { ...status, ...patch };
  try {
    window.dispatchEvent(new CustomEvent(STATUS_EVENT));
  } catch { /* SSR / non-DOM contexts */ }
}

export function subscribeTrackerStatus(cb: () => void): () => void {
  window.addEventListener(STATUS_EVENT, cb);
  return () => window.removeEventListener(STATUS_EVENT, cb);
}
