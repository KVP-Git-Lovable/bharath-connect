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
        TrackingRestarter.prefs(ctx).edit()
                .putLong("lastWatchdogAt", System.currentTimeMillis()).apply();
        if (TrackingRestarter.fixIsStale(ctx)) {
            TrackingRestarter.startService(ctx, "watchdog");
        }
        return Result.success();
    }
}
