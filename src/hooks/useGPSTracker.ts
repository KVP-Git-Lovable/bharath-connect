import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, isNative, prepareNativeLocationSettings } from "@/utils/nativePermissions";
import { shouldAcceptMove, isCoarseFix, GPS_CAPTURE_CONFIG } from "@/utils/gpsCaptureGate";
import { GPS_PROCESSING_CONFIG, haversineMeters as haversine } from "@/utils/gpsDistance";
import {
  initGpsSyncQueue,
  enqueueGpsPoint,
  flushPendingGpsPoints,
  peekNewestQueuedPoint,
  setGpsQueueOwner,

} from "@/services/gpsSyncQueue";
import { logTrackerEvent } from "@/services/trackerHealth";
import { setTrackerStatus } from "@/services/trackerStatus";
import { format } from "date-fns";


const MIN_FORCED_WRITE_MS = 15_000;  // min spacing for non-moving trail-density writes
const FOREGROUND_POLL_MS = 15_000;   // web / non-native fallback (screen-on only)
// Watcher-health: no watcher CALLBACK for this long while the day is open ⇒
// the OS killed the watcher: re-register. (Checked on a slow tick that does
// NOT acquire GPS itself — the watcher is the single acquisition source.)
const WATCHDOG_MS = GPS_CAPTURE_CONFIG.WATCHDOG_MS;
const WATCHDOG_TICK_MS = GPS_CAPTURE_CONFIG.WATCHDOG_TICK_MS;
// Silence this long while the day is open ⇒ take ONE high-accuracy probe fix
// so a stationary device still leaves a trail.
const STATIONARY_PROBE_MS = GPS_CAPTURE_CONFIG.STATIONARY_PROBE_MS;
// Probe fixes worse than this are discarded (coarse network guesses).
const PROBE_MAX_ACCURACY_M = GPS_CAPTURE_CONFIG.PROBE_MAX_ACCURACY_M;

// Reject fixes worse than this (cell-tower guesses create phantom distance) —
// same threshold the display-side trajectory engine uses.
const MAX_ACCURACY_M = GPS_PROCESSING_CONFIG.MAX_ACCURACY_METERS;
const MAX_JUMP_METERS = 10000;       // reject teleport jumps >10km between consecutive samples
// A check-in still open after this long means the user forgot to check out —
// stop tracking instead of running (and draining) all night.
const MAX_OPEN_DAY_MS = 16 * 60 * 60_000;
// How often the tracker re-checks attendance state while actively tracking.
const DAY_RECHECK_MS = 15 * 60_000;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return haversine(a.lat, a.lng, b.lat, b.lng);
}

/**
 * Continuously captures GPS points while the user's attendance day is active
 * (checked in, not checked out).
 *
 * On native (Capacitor) the @capacitor-community/background-geolocation
 * watcher is the SINGLE authoritative GPS acquisition source — tracking
 * survives the app being backgrounded / screen-locked via the plugin's
 * foreground location service. No timers acquire GPS on native; the only
 * periodic tick is a watchdog that re-registers a dead watcher.
 *
 * On web it falls back to foreground polling (screen-on only).
 *
 * Persistence: accepted fixes are enqueued into the local GPS sync queue
 * (gpsSyncQueue.ts) and uploaded in batches — never one network write per
 * fix, and GPS collection never depends on network availability.
 */
export function useGPSTracker(userId: string | null | undefined) {
  const activeRef = useRef(false);
  const lastPointRef = useRef<{ lat: number; lng: number; ts: number; accuracy: number | null } | null>(null);
  const pendingJumpRef = useRef<{
    lat: number;
    lng: number;
    accuracy: number | null;
    ts: number;
    speed: number | null;
    heading: number | null;
  } | null>(null);
  const timerRef = useRef<number | null>(null);
  const watcherIdRef = useRef<string | null>(null);
  const foregroundBusyRef = useRef(false);
  const lastWriteRef = useRef<number>(0);
  // Watcher-health signal: updated on EVERY watcher delivery, even fixes the
  // gates reject — write recency no longer proxies callback receipt now that
  // writes are batched.
  const lastCallbackTsRef = useRef<number>(0);
  /** Diagnostics: has the plugin watcher ever delivered a fix this session? */
  const firstCallbackSeenRef = useRef(false);
  /** Diagnostics: fixes too coarse to anchor on (fused/network provider). */
  const coarseFixCountRef = useRef(0);
  /** Throttle for the periodic attendance-state recheck while tracking. */
  const lastDayCheckRef = useRef<number>(Date.now());
  /**
   * Force a fresh native watcher (set once the watcher is registered).
   * Called by the watchdog and by the app-resume recovery path.
   */
  const forceReregisterRef = useRef<((reason: string) => Promise<void>) | null>(null);


  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let stopBackground: (() => Promise<void>) | null = null;
    let pollTimer: number | null = null;

    /**
     * Whether the attendance day is open. Returns null when the answer is
     * UNKNOWN — the query failed (offline / server unreachable). "I couldn't
     * reach the server" must never be read as "checked out": doing so used to
     * silently kill tracking the moment the app was foregrounded without
     * internet, and it never recovered.
     */
    async function isDayOpen(): Promise<boolean | null> {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: att, error } = await supabase
        .from("attendance")
        .select("check_in_time, check_out_time")
        .eq("user_id", userId!)
        .eq("date", today)
        .maybeSingle();
      if (error) {
        console.warn("[GPSTracker] attendance check failed (offline?) — keeping current tracking state", error.message);
        return null;
      }
      if (!att?.check_in_time || att?.check_out_time) return false;
      // Forgotten check-out guard: an attendance row that has been open longer
      // than a plausible workday keeps the tracker (and the battery drain)
      // running all night and pollutes the next day's totals. Treat it as
      // closed for tracking purposes — the attendance record is untouched.
      const openMs = Date.now() - new Date(att.check_in_time).getTime();
      if (openMs > MAX_OPEN_DAY_MS) {
        console.warn(
          "[GPSTracker] attendance open for",
          Math.round(openMs / 3_600_000),
          "h with no check-out — stopping tracking"
        );
        return false;
      }
      return true;
    }

    async function bootstrapLastPoint() {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase
        .from("gps_tracking")
        .select("latitude, longitude, timestamp, accuracy")
        .eq("user_id", userId!)
        .eq("date", today)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      // A restart may leave unsynced points in the local queue that are newer
      // than anything in the DB — anchor on whichever is most recent, or the
      // first post-restart fix would look like a jump from the past.
      const queued = peekNewestQueuedPoint(userId!, today);
      const dbTs = data ? new Date(data.timestamp).getTime() : -Infinity;
      const qTs = queued ? new Date(queued.timestamp).getTime() : -Infinity;
      if (!lastPointRef.current && (data || queued)) {
        lastPointRef.current =
          qTs > dbTs
            ? {
                lat: queued!.latitude,
                lng: queued!.longitude,
                ts: qTs,
                accuracy: queued!.accuracy ?? null,
              }
            : {
                lat: data!.latitude,
                lng: data!.longitude,
                ts: dbTs,
                accuracy: data!.accuracy ?? null,
              };
      }
    }

    // Local-buffer persistence: synchronous enqueue, batched upload by the
    // sync coordinator. Capture never waits on (or fails with) the network.
    function persistPoint(
      lat: number,
      lng: number,
      accuracy: number | null,
      ts: number,
      advanceAnchor: boolean,
      speed: number | null = null,
      heading: number | null = null
    ) {
      if (advanceAnchor) lastPointRef.current = { lat, lng, ts, accuracy };
      lastWriteRef.current = Date.now();
      setTrackerStatus({ lastFixAt: ts });

      enqueueGpsPoint({
        user_id: userId!,
        latitude: lat,
        longitude: lng,
        accuracy,
        // Device speed (m/s) and heading feed the trajectory engine's
        // plausibility checks — store them whenever the fix provides them.
        speed,
        heading,
        timestamp: new Date(ts).toISOString(),
        date: format(new Date(ts), "yyyy-MM-dd"),
      });
    }

    function insertPoint(
      lat: number,
      lng: number,
      accuracy: number | null,
      speed: number | null = null,
      heading: number | null = null,
      /**
       * The OS timestamp of the fix itself. Batched fused-location delivery
       * (and a WebView that was frozen while backgrounded) can hand several
       * fixes to JS at once, long after they were taken — stamping them with
       * "now" collapses a real trail into one instant. Only trusted when it
       * is recent and not in the future; otherwise we fall back to wall time.
       */
      fixTimeMs: number | null = null
    ) {
      // Reject low-accuracy fixes (IP/Wi-Fi guesses can be 10s of km off)
      if (accuracy != null && accuracy > MAX_ACCURACY_M) {
        console.debug("[GPSTracker] rejected low-accuracy fix", accuracy);
        return;
      }
      const wall = Date.now();
      const fixUsable =
        fixTimeMs != null &&
        Number.isFinite(fixTimeMs) &&
        fixTimeMs <= wall + 60_000 &&
        wall - fixTimeMs < 30 * 60_000;
      const now = fixUsable ? (fixTimeMs as number) : wall;
      const last = lastPointRef.current;
      if (last) {
        const dist = haversineMeters(last, { lat, lng });
        const elapsed = Math.max(0, now - last.ts);
        // Reject unrealistic teleport jumps (e.g. sudden 50km hop while stationary)
        if (dist > MAX_JUMP_METERS && elapsed < 5 * 60_000) {
          console.debug("[GPSTracker] rejected teleport jump", dist, "m in", elapsed, "ms");
          return;
        }

        // Ping-pong guard: on native, the background watcher and the heartbeat
        // poll use different location providers — one can return a stale cached
        // fix, producing alternating A→B→A jumps (seen as ~1.4km hops every
        // minute, doubling the day's distance). Hold any sudden jump >300m
        // within 90s until the NEXT fix confirms the new location; if the next
        // fix lands back near the last good point, the held point was a stale
        // outlier and is dropped.
        if (dist > 300 && elapsed < 90_000) {
          const pending = pendingJumpRef.current;
          if (pending && haversineMeters(pending, { lat, lng }) <= 100) {
            // Confirmed: genuine relocation — flush the held point first.
            persistPoint(
              pending.lat,
              pending.lng,
              pending.accuracy,
              pending.ts,
              true,
              pending.speed,
              pending.heading
            );
            pendingJumpRef.current = null;
          } else {
            pendingJumpRef.current = { lat, lng, accuracy, ts: now, speed, heading };
            return;
          }
        } else if (pendingJumpRef.current) {
          // Returned near the last good point — drop the held outlier.
          pendingJumpRef.current = null;
        }
        // Coarse (fused/network) fixes — typically the tell-tale flat 35 m —
        // are kept for trail/last-known purposes but must never become the
        // movement anchor: anchoring on them is what flattened whole days to
        // 0 km. They are written without advancing the anchor.
        if (isCoarseFix(accuracy)) {
          coarseFixCountRef.current += 1;
          if (coarseFixCountRef.current % 20 === 1) {
            console.debug("[GPSTracker] coarse fix kept as trail-only", {
              accuracy,
              coarseFixes: coarseFixCountRef.current,
            });
          }
          if (elapsed < MIN_FORCED_WRITE_MS) return;
          persistPoint(lat, lng, accuracy, now, false, speed, heading);
          return;
        }
        // Accuracy-aware movement gate: don't credit — or anchor on — a jump
        // smaller than the combined declared error radius of both fixes
        // (clamped by MOVEMENT_THRESHOLD_CAP_M). Ordinary GPS jitter
        // (accuracy up to MAX_ACCURACY_M is accepted above) can otherwise
        // silently drift the anchor every heartbeat, making each subsequent
        // noisy fix measure from an already-drifted point instead of the last
        // confirmed real position.
        const { isRealMove } = shouldAcceptMove(last, { lat, lng, ts: now, accuracy });
        if (!isRealMove) {
          if (elapsed < MIN_FORCED_WRITE_MS) return; // too soon, no real movement — skip write entirely
          // Trail-density sample: keep the trail dense, but don't move the
          // gating anchor — it wasn't a confirmed real move.
          persistPoint(lat, lng, accuracy, now, false, speed, heading);
          return;
        }
      }
      persistPoint(lat, lng, accuracy, now, true, speed, heading);
    }

    async function startNativeBackground() {
      // Idempotent start: never create a second watcher/location stream.
      if (watcherIdRef.current) {
        console.debug("[GPSTracker] duplicate start attempt ignored — watcher already active");
        return true;
      }
      try {
        // Foreground-service prerequisites: fine location, background
        // location and the battery-optimisation exemption. Logged so a
        // workday's logs show whether Android is allowed to keep us alive.
        const powerStatus = await prepareNativeLocationSettings();
        console.info("[GPSTracker] native location power status", powerStatus);
        void logTrackerEvent(userId, "permission_status", { ...(powerStatus ?? {}) });




        // Only register the watcher once the OS has actually granted location.
        // Requesting here too would race the startup permission request and
        // Android would abandon one of the callbacks, leaving location denied.
        try {
          const { Geolocation } = await import("@capacitor/geolocation");
          const perm = await Geolocation.checkPermissions();
          if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
            console.warn("[GPSTracker] Location not granted yet — skipping background watcher");
            return false;
          }
        } catch (e) {
          console.warn("[GPSTracker] Could not check location permission:", e);
          return false;
        }

        const { registerPlugin } = await import("@capacitor/core");
        const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
        if (!BackgroundGeolocation?.addWatcher) return false;

        const register = async () => {
          const id = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: "Tracking your workday location. Tap to open JOVO.",
              backgroundTitle: "JOVO — Day Tracking active",
              requestPermissions: false,

              stale: false,
              // OS-level delivery filter; insertPoint gates further.
              distanceFilter: GPS_CAPTURE_CONFIG.MOVING.distanceFilter,
              // LocationRequest tuning (needs the patched plugin, see
              // patches/): batched delivery lets the radio duty-cycle
              // instead of upstream's hardcoded 1 Hz. High accuracy is
              // retained. Unpatched builds ignore these keys.
              interval: GPS_CAPTURE_CONFIG.MOVING.intervalMs,
              fastestInterval: GPS_CAPTURE_CONFIG.MOVING.fastestIntervalMs,
              maxWaitTime: GPS_CAPTURE_CONFIG.MOVING.maxWaitMs,
            },
            (location: any, error: any) => {
              if (error) {
                console.warn("[GPSTracker] watcher error", error);
                void logTrackerEvent(userId, "watcher_error", {
                  code: error?.code ?? null,
                  message: error?.message ?? String(error),
                });
                return;
              }
              if (!location) return;
              // Health signal first — even fixes the gates reject prove the
              // watcher is alive.
              if (!firstCallbackSeenRef.current) {
                firstCallbackSeenRef.current = true;
                console.info("[GPSTracker] first watcher callback", {
                  accuracy: location.accuracy,
                  speed: location.speed,
                });
              }
              lastCallbackTsRef.current = Date.now();
              setTrackerStatus({ lastCallbackAt: lastCallbackTsRef.current, watcherAlive: true });

              if (!activeRef.current) return;
              if (cancelled) return;
              try {
                insertPoint(
                  location.latitude,
                  location.longitude,
                  location.accuracy ?? null,
                  location.speed ?? null,
                  location.bearing ?? null,
                  // Batched / post-wake deliveries carry their own capture
                  // time — keep the trail on the real clock.
                  typeof location.time === "number" ? location.time : null
                );
              } catch { /* ignore */ }
            }
          );
          watcherIdRef.current = id;
        };

        /**
         * Force a fresh watcher. Used both by the watchdog and — critically —
         * on every app resume: while the WebView is frozen no JS timer runs,
         * so a watcher Android killed in the background can only be noticed
         * and replaced the moment the user brings the app back.
         */
        forceReregisterRef.current = async (reason: string) => {
          if (cancelled || !activeRef.current) return;
          try {
            if (watcherIdRef.current) {
              await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
              watcherIdRef.current = null;
            }
            await register();
            lastCallbackTsRef.current = Date.now();
            setTrackerStatus({ watcherAlive: true, lastCallbackAt: lastCallbackTsRef.current });
            console.info("[GPSTracker] watcher re-registered", { reason, id: watcherIdRef.current });
            void logTrackerEvent(userId, "watcher_reregistered", { reason });
          } catch (e: any) {
            console.warn("[GPSTracker] watcher re-registration failed", e);
            setTrackerStatus({ watcherAlive: false });
            void logTrackerEvent(userId, "watcher_register_failed", {
              reason,
              message: e?.message ?? String(e),
            });
          }

        };


        await register();
        lastWriteRef.current = Date.now();
        lastCallbackTsRef.current = Date.now();
        setTrackerStatus({
          native: true,
          watcherAlive: true,
          lastCallbackAt: lastCallbackTsRef.current,
        });

        console.info("[GPSTracker] watcher registered", {
          id: watcherIdRef.current,
          config: GPS_CAPTURE_CONFIG.MOVING,
        });
        void logTrackerEvent(userId, "watcher_registered", {
          id: watcherIdRef.current,
          ...GPS_CAPTURE_CONFIG.MOVING,
        });

        // Watchdog + stationary probe.
        //  - Probe: after STATIONARY_PROBE_MS of watcher silence take ONE
        //    HIGH-ACCURACY fix so a parked device still leaves a usable trail.
        //    Coarse fixes (network provider, ~35 m) are discarded — writing
        //    them poisons the movement anchor and flattens the day to 0 km.
        //  - Health: watcher silence beyond WATCHDOG_MS means Android killed
        //    the watcher, whether or not the probe succeeded — re-register.
        pollTimer = window.setInterval(async () => {
          if (!activeRef.current || cancelled) return;
          // Cheap periodic day-state check (every DAY_RECHECK_MS, not every
          // tick) so a forgotten check-out or a real check-out that happened
          // while the app was backgrounded stops the tracker.
          if (Date.now() - lastDayCheckRef.current > DAY_RECHECK_MS) {
            lastDayCheckRef.current = Date.now();
            await evaluate();
            if (!activeRef.current || cancelled) return;
          }
          const silenceMs = Date.now() - lastCallbackTsRef.current;
          if (silenceMs < STATIONARY_PROBE_MS) return;

          try {
            const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
            const acc = pos.accuracy ?? null;
            if (acc != null && acc > PROBE_MAX_ACCURACY_M) {
              console.debug("[GPSTracker] discarded coarse probe fix", acc);
              void logTrackerEvent(userId, "probe_discarded", { accuracy: acc });
            } else if (!cancelled && activeRef.current) {
              // Trail-density sample: insertPoint's gates decide whether this
              // counts as movement — distance maths is untouched.
              insertPoint(
                pos.latitude,
                pos.longitude,
                acc,
                pos.speed ?? null,
                pos.heading ?? null
              );
            }
          } catch (e: any) {
            console.warn("[GPSTracker] stationary probe failed", e);
            void logTrackerEvent(userId, "probe_failed", { message: e?.message ?? String(e) });
          }

          // Health test is independent of the probe: prolonged watcher
          // silence alone is proof enough that the watcher is gone.
          const silenceNow = Date.now() - lastCallbackTsRef.current;
          if (silenceNow > WATCHDOG_MS) {
            console.warn(
              "[GPSTracker] no watcher callback for",
              Math.round(silenceNow / 1000),
              "s — re-registering watcher"
            );
            void logTrackerEvent(userId, "watcher_silence", {
              silence_seconds: Math.round(silenceNow / 1000),
            });
            await forceReregisterRef.current?.("watchdog_silence");
          }

        }, WATCHDOG_TICK_MS);




        stopBackground = async () => {
          try {
            if (watcherIdRef.current) {
              await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
              watcherIdRef.current = null;
            }
          } catch { /* ignore */ }
        };
        return true;
      } catch (e) {
        console.warn("[GPSTracker] background plugin unavailable, falling back", e);
        return false;
      }
    }

    // Web / non-native fallback ONLY (screen-on): here the poll IS the
    // acquisition source — on native the watcher is the single source and
    // this never runs.
    async function startForeground() {
      const tick = async () => {
        if (cancelled || foregroundBusyRef.current) return;
        if (!activeRef.current) return;
        foregroundBusyRef.current = true;
        try {
          const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
          insertPoint(
            pos.latitude,
            pos.longitude,
            pos.accuracy ?? null,
            pos.speed ?? null,
            pos.heading ?? null
          );
        } catch { /* ignore */ } finally {
          foregroundBusyRef.current = false;
        }
      };
      tick();
      timerRef.current = window.setInterval(tick, FOREGROUND_POLL_MS);
    }

    // Self-healing start: (re)start acquisition when the day is open but no
    // watcher/poll is running (e.g. after a transient stop, or when the user
    // checks in later). Single-flight + idempotent-start guards make it safe
    // to call from every evaluate() — it can never create a second stream.
    let startingAcquisition = false;
    async function ensureAcquisitionRunning() {
      if (startingAcquisition || cancelled || !activeRef.current) return;
      if (watcherIdRef.current != null || timerRef.current != null) return;
      startingAcquisition = true;
      try {
        if (isNative()) {
          const ok = await startNativeBackground();
          if (!ok) await startForeground();
        } else {
          await startForeground();
        }
      } finally {
        startingAcquisition = false;
      }
    }

    async function evaluate() {
      const open = await isDayOpen();
      if (open === null) return; // unknown (offline) — keep the current state
      const wasActive = activeRef.current;
      activeRef.current = open;
      setTrackerStatus({ active: open, native: isNative() });
      if (!open) {
        // Day closed → stop background watcher if any, then drain the queue
        if (stopBackground) { await stopBackground(); stopBackground = null; }
        if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null; }
        if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
        forceReregisterRef.current = null;
        setTrackerStatus({ watcherAlive: false });
        if (wasActive) void logTrackerEvent(userId, "tracking_stopped", {});
        void flushPendingGpsPoints();
      } else {
        if (!wasActive) void logTrackerEvent(userId, "tracker_started", {});
        void ensureAcquisitionRunning();
      }
    }

    /**
     * App-resume recovery. Android freezes WebView timers in the background,
     * so the watchdog cannot notice — let alone repair — a watcher the OS
     * killed while the phone was pocketed. The instant the app becomes
     * visible again we therefore treat prolonged watcher silence as a dead
     * watcher and rebuild it immediately, before anything else.
     */
    async function recoverOnResume() {
      if (cancelled) return;
      await evaluate();
      if (!activeRef.current || cancelled) return;
      const silenceMs = Date.now() - lastCallbackTsRef.current;
      if (!isNative()) return;
      if (watcherIdRef.current == null) {
        void ensureAcquisitionRunning();
        return;
      }
      if (silenceMs > RESUME_SILENCE_MS) {
        void logTrackerEvent(userId, "resume_recovery", {
          silence_seconds: Math.round(silenceMs / 1000),
        });
        setTrackerStatus({ watcherAlive: false });
        await forceReregisterRef.current?.("app_resume");
      }
      void flushPendingGpsPoints();
    }

    (async () => {
      initGpsSyncQueue();
      // Shared-device safety: discard any points buffered for another user —
      // the server would reject them forever and block this user's uploads.
      setGpsQueueOwner(userId!);

      await bootstrapLastPoint();
      await evaluate(); // starts acquisition itself when the day is open
      if (!activeRef.current) {
        // Re-check periodically in case user checks in later
        const recheck = window.setInterval(async () => {
          if (cancelled) return;
          await evaluate();
          if (activeRef.current) window.clearInterval(recheck);
        }, 30_000);
      }
    })();

    // Re-evaluate day status AND repair a background-killed watcher whenever
    // the app comes back to the foreground (catches check-out too).
    const onVisibility = () => {
      if (document.visibilityState === "visible") void recoverOnResume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Capacitor's own resume signal: fires on native even when the WebView
    // never reports a visibility change (screen-off / task-switch cases).
    let removeAppListener: (() => void) | null = null;
    if (isNative()) {
      void (async () => {
        try {
          const { App } = await import("@capacitor/app");
          const handle = await App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) void recoverOnResume();
          });
          if (cancelled) { handle.remove(); return; }
          removeAppListener = () => handle.remove();
        } catch (e) {
          console.debug("[GPSTracker] app state listener unavailable", e);
        }
      })();
    }

    // Re-evaluate immediately when useAttendance signals a successful
    // check-in/check-out, instead of waiting for the next visibility-change
    // or the 30s recheck loop. evaluate() starts acquisition only through
    // ensureAcquisitionRunning, whose guards make a second tracking path
    // impossible.
    const onAttendanceChanged = () => evaluate();
    window.addEventListener("attendance-changed", onAttendanceChanged);

    return () => {
      cancelled = true;
      activeRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("attendance-changed", onAttendanceChanged);
      removeAppListener?.();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (pollTimer) window.clearInterval(pollTimer);
      if (stopBackground) stopBackground();
    };

  }, [userId]);
}
