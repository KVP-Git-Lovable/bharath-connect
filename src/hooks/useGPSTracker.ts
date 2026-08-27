import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, isNative, prepareNativeLocationSettings } from "@/utils/nativePermissions";
import { shouldAcceptMove } from "@/utils/gpsCaptureGate";
import { format } from "date-fns";

const INTERVAL_MS = 15_000;          // safety heartbeat: sample at least every 15s
const FOREGROUND_POLL_MS = 15_000;   // web / non-native fallback
const WATCHDOG_MS = 5 * 60_000;      // no point written for 5 min while the day is
                                     // open ⇒ the OS killed the watcher: re-register
const MAX_ACCURACY_M = 150;          // reject fixes worse than 150m (cell-tower guesses create phantom distance)
const MAX_JUMP_METERS = 10000;       // reject teleport jumps >10km between consecutive samples

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Continuously captures GPS points into `gps_tracking` while the user's
 * attendance day is active (checked in, not checked out).
 *
 * On native (Capacitor) it uses @capacitor-community/background-geolocation
 * so tracking survives the app being backgrounded / screen-locked. A
 * persistent Android notification lets the user know tracking is active.
 *
 * On web it falls back to foreground polling.
 *
 * Sampling rule: a point is written whenever the accuracy-aware movement
 * gate (see gpsCaptureGate.ts) confirms real movement, or forced every 30s
 * for trail density (without moving the gating anchor if it wasn't a
 * confirmed real move).
 */
export function useGPSTracker(userId: string | null | undefined) {
  const activeRef = useRef(false);
  const lastPointRef = useRef<{ lat: number; lng: number; ts: number; accuracy: number | null } | null>(null);
  const pendingJumpRef = useRef<{ lat: number; lng: number; accuracy: number | null; ts: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const watcherIdRef = useRef<string | null>(null);
  const foregroundBusyRef = useRef(false);
  const insertChainRef = useRef<Promise<void>>(Promise.resolve());
  const lastWriteRef = useRef<number>(0);

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
      if (data && !lastPointRef.current) {
        lastPointRef.current = {
          lat: data.latitude,
          lng: data.longitude,
          ts: new Date(data.timestamp).getTime(),
          accuracy: data.accuracy ?? null,
        };
      }
    }

    async function persistPoint(
      lat: number,
      lng: number,
      accuracy: number | null,
      ts: number,
      advanceAnchor: boolean
    ) {
      if (advanceAnchor) lastPointRef.current = { lat, lng, ts, accuracy };
      lastWriteRef.current = Date.now();
      const today = format(new Date(), "yyyy-MM-dd");
      await supabase.from("gps_tracking").insert({
        user_id: userId!,
        latitude: lat,
        longitude: lng,
        accuracy,
        timestamp: new Date(ts).toISOString(),
        date: today,
      });
    }

    async function insertPoint(lat: number, lng: number, accuracy: number | null) {
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
            await persistPoint(pending.lat, pending.lng, pending.accuracy, pending.ts, true);
            pendingJumpRef.current = null;
          } else {
            pendingJumpRef.current = { lat, lng, accuracy, ts: now };
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
          if (elapsed < INTERVAL_MS) return; // too soon, no real movement — skip write entirely
          // Heartbeat-forced sample: keep the trail dense, but don't move the
          // gating anchor — it wasn't a confirmed real move.
          await persistPoint(lat, lng, accuracy, now, false);
          return;
        }
      }
      await persistPoint(lat, lng, accuracy, now, true);
    }

    function queueInsert(lat: number, lng: number, accuracy: number | null) {
      // Native has two independent producers (background watcher + heartbeat
      // poll) calling insertPoint; serialize them so they can't interleave
      // across insertPoint's await boundaries and race pendingJumpRef/lastPointRef.
      insertChainRef.current = insertChainRef.current
        .catch(() => {})
        .then(() => insertPoint(lat, lng, accuracy));
      return insertChainRef.current;
    }

    async function startNativeBackground() {
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
              distanceFilter: 5, // OS-level filter; we further throttle in insertPoint
            },
            async (location: any, error: any) => {
              if (error || !location) return;
              if (!activeRef.current) return;
              if (cancelled) return;
              try {
                await queueInsert(location.latitude, location.longitude, location.accuracy ?? null);
              } catch { /* ignore */ }
            }
          );
          watcherIdRef.current = id;
        };

        await register();
        lastWriteRef.current = Date.now();

        // Heartbeat — force a sample even when stationary, and act as a
        // watchdog: Android's Doze / battery optimiser silently kills the
        // background watcher, which is what leaves multi-hour holes in the
        // trail. If nothing has been written for WATCHDOG_MS while the day is
        // open, tear the watcher down and register a fresh one.
        pollTimer = window.setInterval(async () => {
          if (!activeRef.current || cancelled) return;
          try {
            const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
            await queueInsert(pos.latitude, pos.longitude, pos.accuracy ?? null);
          } catch { /* ignore */ }
          if (Date.now() - lastWriteRef.current > WATCHDOG_MS) {
            console.warn("[GPSTracker] watcher appears dead — re-registering");
            try {
              if (watcherIdRef.current) {
                await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
                watcherIdRef.current = null;
              }
              await register();
              lastWriteRef.current = Date.now();
            } catch (e) {
              console.warn("[GPSTracker] watcher re-registration failed", e);
            }
          }
        }, INTERVAL_MS);


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

    async function startForeground() {
      const tick = async () => {
        if (cancelled || foregroundBusyRef.current) return;
        if (!activeRef.current) return;
        foregroundBusyRef.current = true;
        try {
          const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
          await queueInsert(pos.latitude, pos.longitude, pos.accuracy ?? null);
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
        // Day closed → stop background watcher if any
        if (stopBackground) { await stopBackground(); stopBackground = null; }
        if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null; }
        if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      }
    }

    (async () => {
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
