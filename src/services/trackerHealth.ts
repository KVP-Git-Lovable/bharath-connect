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
  | "permission_status"
  | "tracking_stopped";

/** Don't spam the table: identical events are rate-limited per session. */
const MIN_GAP_MS: Partial<Record<TrackerEvent, number>> = {
  probe_discarded: 10 * 60_000,
  probe_failed: 10 * 60_000,
  watcher_error: 5 * 60_000,
  resume_recovery: 60_000,
  permission_status: 30 * 60_000,
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
