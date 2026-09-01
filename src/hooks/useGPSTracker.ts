import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, isNative, prepareNativeLocationSettings } from "@/utils/nativePermissions";
import { shouldAcceptMove, GPS_CAPTURE_CONFIG } from "@/utils/gpsCaptureGate";
import { GPS_PROCESSING_CONFIG, haversineMeters as haversine } from "@/utils/gpsDistance";
import {
  initGpsSyncQueue,
  enqueueGpsPoint,
  flushPendingGpsPoints,
  peekNewestQueuedPoint,
} from "@/services/gpsSyncQueue";
import { format } from "date-fns";

const MIN_FORCED_WRITE_MS = 15_000;  // min spacing for non-moving trail-density writes
const FOREGROUND_POLL_MS = 15_000;   // web / non-native fallback (screen-on only)
// Watcher-health: no watcher CALLBACK for this long while the day is open ⇒
// the OS killed the watcher: re-register. (Checked on a slow tick that does
// NOT acquire GPS itself — the watcher is the single acquisition source.)
const WATCHDOG_MS = GPS_CAPTURE_CONFIG.WATCHDOG_MS;
const WATCHDOG_TICK_MS = GPS_CAPTURE_CONFIG.WATCHDOG_TICK_MS;
// Silence this long while the day is open ⇒ take ONE low-power probe fix so a
// stationary device still leaves a trail (and to health-test the watcher).
const STATIONARY_PROBE_MS = GPS_CAPTURE_CONFIG.STATIONARY_PROBE_MS;

// Reject fixes worse than this (cell-tower guesses create phantom distance) —
// same threshold the display-side trajectory engine uses.
const MAX_ACCURACY_M = GPS_PROCESSING_CONFIG.MAX_ACCURACY_METERS;
const MAX_JUMP_METERS = 10000;       // reject teleport jumps >10km between consecutive samples

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

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let stopBackground: (() => Promise<void>) | null = null;
    let pollTimer: number | null = null;

    async function isDayOpen(): Promise<boolean> {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: att } = await supabase
        .from("attendance")
        .select("check_in_time, check_out_time")
        .eq("user_id", userId!)
        .eq("date", today)
        .maybeSingle();
      return !!att?.check_in_time && !att?.check_out_time;
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
      heading: number | null = null
    ) {
      // Reject low-accuracy fixes (IP/Wi-Fi guesses can be 10s of km off)
      if (accuracy != null && accuracy > MAX_ACCURACY_M) {
        console.debug("[GPSTracker] rejected low-accuracy fix", accuracy);
        return;
      }
      const now = Date.now();
      const last = lastPointRef.current;
      if (last) {
        const dist = haversineMeters(last, { lat, lng });
        const elapsed = now - last.ts;
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
        // Accuracy-aware movement gate: don't credit — or anchor on — a jump
        // smaller than the combined declared error radius of both fixes.
        // Ordinary GPS jitter (accuracy up to MAX_ACCURACY_M is accepted
        // above) can otherwise silently drift the anchor every heartbeat,
        // making each subsequent noisy fix measure from an already-drifted
        // point instead of the last confirmed real position.
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
        await prepareNativeLocationSettings();

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
              if (error || !location) return;
              // Health signal first — even fixes the gates reject prove the
              // watcher is alive.
              lastCallbackTsRef.current = Date.now();
              if (!activeRef.current) return;
              if (cancelled) return;
              try {
                insertPoint(
                  location.latitude,
                  location.longitude,
                  location.accuracy ?? null,
                  location.speed ?? null,
                  location.bearing ?? null
                );
              } catch { /* ignore */ }
            }
          );
          watcherIdRef.current = id;
        };

        await register();
        lastWriteRef.current = Date.now();
        lastCallbackTsRef.current = Date.now();

        // Watchdog ONLY — acquires no GPS of its own (the watcher is the
        // single acquisition source). A stationary device legitimately
        // produces no watcher callbacks (distanceFilter), so silence alone is
        // NOT proof of a dead watcher: after STATIONARY_PROBE_MS of silence we
        // take exactly ONE low-power probe fix — that both keeps the trail
        // dense while parked and acts as the health test. Only when the probe
        // itself fails (and the silence exceeds WATCHDOG_MS) do we conclude
        // Android killed the watcher and re-register it.
        pollTimer = window.setInterval(async () => {
          if (!activeRef.current || cancelled) return;
          const silenceMs = Date.now() - lastCallbackTsRef.current;
          if (silenceMs < STATIONARY_PROBE_MS) return;

          let probeOk = false;
          try {
            const pos = await getCurrentPosition({ enableHighAccuracy: false, timeout: 20000 });
            probeOk = true;
            if (!cancelled && activeRef.current) {
              // Trail-density sample: insertPoint's gates decide whether this
              // counts as movement — distance maths is untouched.
              insertPoint(
                pos.latitude,
                pos.longitude,
                pos.accuracy ?? null,
                pos.speed ?? null,
                pos.heading ?? null
              );
            }
          } catch (e) {
            console.warn("[GPSTracker] stationary probe failed", e);
          }

          if (!probeOk && silenceMs > WATCHDOG_MS) {
            console.warn("[GPSTracker] watcher appears dead — re-registering");
            try {
              if (watcherIdRef.current) {
                await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
                watcherIdRef.current = null;
              }
              await register();
              lastCallbackTsRef.current = Date.now();
            } catch (e) {
              console.warn("[GPSTracker] watcher re-registration failed", e);
            }
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

    async function evaluate() {
      const open = await isDayOpen();
      activeRef.current = open;
      if (!open) {
        // Day closed → stop background watcher if any, then drain the queue
        if (stopBackground) { await stopBackground(); stopBackground = null; }
        if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null; }
        if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
        void flushPendingGpsPoints();
      }
    }

    (async () => {
      initGpsSyncQueue();
      // Shared-device safety: discard any points buffered for another user —
      // the server would reject them forever and block this user's uploads.
      setGpsQueueOwner(userId!);

      await bootstrapLastPoint();
      await evaluate();
      if (!activeRef.current) {
        // Re-check periodically in case user checks in later
        const recheck = window.setInterval(async () => {
          if (cancelled) return;
          await evaluate();
          if (activeRef.current) {
            window.clearInterval(recheck);
            if (isNative()) {
              const ok = await startNativeBackground();
              if (!ok) await startForeground();
            } else {
              await startForeground();
            }
          }
        }, 30_000);
        return;
      }
      if (isNative()) {
        const ok = await startNativeBackground();
        if (!ok) await startForeground();
      } else {
        await startForeground();
      }
    })();

    // Re-evaluate day status when tab becomes visible (catches check-out)
    const onVisibility = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Re-evaluate immediately when useAttendance signals a successful
    // check-in/check-out, instead of waiting for the next visibility-change
    // or the 30s recheck loop. evaluate() only ever stops tracking when the
    // day is closed — it never starts a watcher on its own — so this can't
    // start a second tracking path.
    const onAttendanceChanged = () => evaluate();
    window.addEventListener("attendance-changed", onAttendanceChanged);

    return () => {
      cancelled = true;
      activeRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("attendance-changed", onAttendanceChanged);
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (pollTimer) window.clearInterval(pollTimer);
      if (stopBackground) stopBackground();
    };
  }, [userId]);
}
