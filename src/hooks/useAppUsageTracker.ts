import { useEffect, useRef } from "react";
import { registerPlugin } from "@capacitor/core";

import { APP_USAGE_CONFIG } from "@/utils/appUsageConfig";
import { isNativePlatform } from "@/utils/platform";
import { initAppLifecycleBroker, onAppForeground } from "@/services/appLifecycleBroker";
import { mapRecordsToRows, type NativeUsageRecord } from "@/services/appUsageReconcile";
import {
  enqueueAppUsage,
  flushPendingAppUsage,
  initAppUsageSyncQueue,
  setAppUsageQueueOwner,
} from "@/services/appUsageSyncQueue";

/**
 * Ships app-usage intervals recorded natively to the server.
 *
 * Note what this hook does NOT do: it does not measure anything. All the
 * measuring happens in AppUsageTracker.java, which is installed from the
 * Application and keeps recording whether or not a WebView exists. Losing this
 * hook loses the upload, never the data -- which is the whole point, since
 * force stop and OS kills are precisely the cases where no JS runs again.
 *
 * Mounted from AppLayout, so it only runs while somebody is signed in.
 *
 * Android-only for now. The web fallback recorder is a later phase; on web this
 * hook is an explicit no-op rather than silently recording lower-quality data
 * that would be mixed into the same totals.
 */

interface DrainResult {
  token: string | null;
  records: NativeUsageRecord[];
}

interface AppUsagePlugin {
  setIdentity(options: { userId: string | null }): Promise<{ ok: boolean }>;
  drain(): Promise<DrainResult>;
  ack(options: { token: string }): Promise<{ ok: boolean }>;
  getState(): Promise<Record<string, unknown>>;
}

const AppUsage = registerPlugin<AppUsagePlugin>("AppUsage");

export function useAppUsageTracker(userId: string | null | undefined) {
  const drainingRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (!isNativePlatform()) return;

    let cancelled = false;

    /**
     * Two-phase: the records are durably queued and persisted BEFORE the native
     * journal is acked, so a WebView that dies mid-drain replays them rather
     * than losing them. Deterministic row ids make the replay harmless.
     */
    async function drainAndEnqueue(reason: string) {
      if (cancelled || drainingRef.current) return;
      drainingRef.current = true;
      try {
        const result = await AppUsage.drain();
        if (!result?.token || cancelled) return;
        const mapped = mapRecordsToRows(result.records ?? []);
        enqueueAppUsage(mapped); // persists synchronously
        await AppUsage.ack({ token: result.token });
        if (mapped.droppedUnattributed > 0 && import.meta.env.DEV) {
          console.debug(
            `[appUsage] dropped ${mapped.droppedUnattributed} intervals recorded while signed out (${reason})`
          );
        }
        void flushPendingAppUsage();
      } catch (e) {
        if (import.meta.env.DEV) console.debug("[appUsage] drain unavailable", e);
      } finally {
        drainingRef.current = false;
      }
    }

    initAppUsageSyncQueue();
    setAppUsageQueueOwner(userId);
    initAppLifecycleBroker();

    // Tell the recorder who is using the app. It closes the open interval and
    // opens a fresh one, so no interval is ever split across two users.
    void AppUsage.setIdentity({ userId })
      .then(() => drainAndEnqueue("startup"))
      .catch(() => {
        /* plugin not present (older APK) — nothing to drain */
      });

    const unsubscribe = onAppForeground(() => void drainAndEnqueue("resume"));

    // Bounds how long a closed interval sits on the device. It measures
    // nothing, so background throttling of this timer is irrelevant.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void drainAndEnqueue("interval");
    }, APP_USAGE_CONFIG.DRAIN_INTERVAL_MS);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [userId]);
}
