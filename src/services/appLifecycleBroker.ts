/**
 * One place that answers "did the app just come to the foreground".
 *
 * Android needs both signals. The WebView does not reliably emit
 * visibilitychange on screen-off or task-switch -- useGPSTracker.ts carries an
 * explicit comment to that effect and pairs the two for exactly this reason --
 * but both DO fire for the same physical transition when things are working, so
 * they are coalesced here. Without that, every resume would trigger two drains
 * and two flushes.
 *
 * The three existing lifecycle listeners (useGPSTracker, gpsSyncQueue,
 * usePushNotifications) are deliberately NOT migrated onto this broker. They
 * are load-bearing, and in the GPS case they are the recovery path the tracker
 * depends on; touching them to save one registration is a bad trade. This is
 * the intended consolidation point for a later, independently-testable change.
 */

type Direction = "foreground" | "background";
type Listener = (source: string) => void;

const COALESCE_MS = 500;

let initialized = false;
const foregroundListeners = new Set<Listener>();
const backgroundListeners = new Set<Listener>();
let lastDirection: Direction | null = null;
let lastAt = 0;

function emit(direction: Direction, source: string) {
  const now = Date.now();
  if (direction === lastDirection && now - lastAt < COALESCE_MS) return;
  lastDirection = direction;
  lastAt = now;
  const listeners = direction === "foreground" ? foregroundListeners : backgroundListeners;
  listeners.forEach((cb) => {
    try {
      cb(source);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[appLifecycleBroker] listener threw", e);
    }
  });
}

/** Idempotent; listeners are attached once for the life of the process. */
export function initAppLifecycleBroker(): void {
  if (initialized) return;
  initialized = true;

  document.addEventListener("visibilitychange", () => {
    emit(document.visibilityState === "visible" ? "foreground" : "background", "visibilitychange");
  });

  // Capacitor's own signal: fires on native even when the WebView never
  // reports a visibility change. No-ops on web.
  import("@capacitor/app")
    .then(({ App }) => {
      App.addListener("appStateChange", ({ isActive }) => {
        emit(isActive ? "foreground" : "background", "appStateChange");
      });
    })
    .catch(() => {
      /* web — visibilitychange covers it */
    });
}

export function onAppForeground(cb: Listener): () => void {
  foregroundListeners.add(cb);
  return () => foregroundListeners.delete(cb);
}

export function onAppBackground(cb: Listener): () => void {
  backgroundListeners.add(cb);
  return () => backgroundListeners.delete(cb);
}

/** Test hook: reset module state (not used by production code). */
export function __resetAppLifecycleBrokerForTests(): void {
  initialized = false;
  foregroundListeners.clear();
  backgroundListeners.clear();
  lastDirection = null;
  lastAt = 0;
}
