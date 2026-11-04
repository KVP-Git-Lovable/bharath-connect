package ai.quickapp.fieldforce;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Runs every ~15 minutes (Android's minimum for periodic work). If a day is
 * open and no native fix has arrived recently, the location service is
 * restarted. Backstop for OEM kills and crashes that boot handling can't see.
 * When the day is closed it cancels itself.
 */
public class TrackingWatchdogWorker extends Worker {
    public TrackingWatchdogWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        if (!TrackingRestarter.isDayOpen(ctx)) {
            TrackingRestarter.cancelWatchdog(ctx);
            return Result.success();
        }
        long now = System.currentTimeMillis();
        TrackingRestarter.prefs(ctx).edit()
                .putLong("lastWatchdogAt", now)
                // Proves the restart/heartbeat path itself is alive even on a
                // day with few real fixes (e.g. a stationary device held below
                // the displacement filter) — a distinct signal from "a fix
                // arrived," checked independently by the diagnostics dialog.
                .putLong("lastServiceHeartbeatTimestamp", now)
                .apply();
        if (TrackingRestarter.fixIsStale(ctx)) {
            TrackingRestarter.startService(ctx, "watchdog");
        }
        return Result.success();
    }
}
