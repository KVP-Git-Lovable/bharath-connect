import { supabase } from "@/integrations/supabase/client";

/**
 * Remote tracker-health log.
 *
 * The 2 Sep gaps could only be explained by pulling raw GPS rows and inferring
 * what the device was doing. These records make that explicit: whether the
 * native watcher was ever registered, whether it died, whether Android had
 * granted background location / battery-optimisation exemption, and when the
 * app was resurrected by the user opening the app.
 *
 * Never throws and never blocks capture — a failed health write must not
 * affect tracking.
 */
export type TrackerEvent =
  | "tracker_started"
  | "watcher_registered"
  | "watcher_error"
  | "watcher_silence"
  | "watcher_reregistered"
  | "watcher_register_failed"
  | "probe_discarded"
  | "probe_failed"
  | "resume_recovery"
  | "native_buffer_drained"
  | "permission_status"
  | "native_recovered"
  | "tracking_stopped"
  // Sync/distance-loss side (gpsSyncQueue.ts, useAttendance.ts) — distinct
  // from the capture-side events above, surfaced together in the "Check user
  // tracking issues" dialog on /gps-tracking.
  | "gps_points_discarded"
  | "checkout_points_unsynced"
  // Fired immediately before prepareNativeLocationSettings (nativePermissions.ts)
  // redirects the user to a Settings screen for battery-exemption or
  // background-location setup — the one point in that flow guaranteed to run
  // even if the app gets backgrounded-and-killed before setup completes.
  | "location_setup_redirect"
  // Fired at the very top of that same flow, before anything else runs.
  // Present with no location_setup_redirect/permission_status after it ⇒
  // the stall is in the foreground-location request or the native status
  // read itself, not in a Settings redirect.
  | "location_setup_started"
  // Periodic snapshot of the four native health timestamps (capture
  // resilience hardening): lastRealGpsFixTimestamp, lastNativeCallbackAt,
  // lastNativePersistenceTimestamp, lastServiceHeartbeatTimestamp. Lets the
  // diagnostics dialog tell "no real fixes are happening" apart from "the
  // restart/heartbeat path itself is dead" — two different failures that
  // look identical from distance alone.
  | "native_health_snapshot"
  // Device-wide Location is off at the OS level — distinct from a denied
  // app permission; no amount of in-app retry can recover from this, only
  // the user can. Honest-limit reporting, not a bug to work around.
  | "location_services_disabled"
  // A previously-unguarded native call in the permission-prep/watcher-start
  // chain (startNativeBackground / prepareNativeLocationSettings) never
  // settled within its timeout — the single highest-value new signal here:
  // before this, a hang in this chain produced ZERO events, no matter how
  // many times the app restarted. details.stage identifies which await hung.
  | "native_start_timeout"
  // The same chain threw instead of hanging — startNativeBackground's outer
  // catch previously only did console.warn.
  | "native_start_error"
  // A rejection inside a GPS/location-relevant native helper
  // (nativePermissions.ts) that previously only logged to console.
  // details.step identifies which helper failed.
  | "native_permission_error";

/** Don't spam the table: identical events are rate-limited per session. */
const MIN_GAP_MS: Partial<Record<TrackerEvent, number>> = {
  probe_discarded: 10 * 60_000,
  probe_failed: 10 * 60_000,
  watcher_error: 5 * 60_000,
  resume_recovery: 60_000,
  native_buffer_drained: 60_000,
  permission_status: 30 * 60_000,
  native_health_snapshot: 10 * 60_000,
  location_services_disabled: 10 * 60_000,
  native_permission_error: 5 * 60_000,
};

const lastSentAt = new Map<TrackerEvent, number>();

function platformLabel(): string {
  try {
    const cap = (window as any).Capacitor;
    if (cap?.getPlatform) return `${cap.getPlatform()}${cap.isNativePlatform?.() ? "-native" : "-web"}`;
  } catch { /* ignore */ }
  return "web";
}

export async function logTrackerEvent(
  userId: string | null | undefined,
  event: TrackerEvent,
  details: Record<string, unknown> = {}
): Promise<void> {
  if (!userId) return;
  const gap = MIN_GAP_MS[event];
  if (gap) {
    const last = lastSentAt.get(event) ?? 0;
    if (Date.now() - last < gap) return;
    lastSentAt.set(event, Date.now());
  }
  try {
    await supabase.from("gps_tracker_events").insert({
      user_id: userId,
      event,
      details: details as any,
      platform: platformLabel(),
      occurred_at: new Date().toISOString(),
    });
  } catch (e) {
    console.debug("[trackerHealth] log failed (ignored)", e);
  }
}
