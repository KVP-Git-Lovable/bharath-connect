package ai.quickapp.fieldforce;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.core.content.ContextCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService;

import java.util.concurrent.TimeUnit;

/**
 * Shared restart logic for the boot receiver and the periodic watchdog.
 * Only acts while the app has marked an attendance day open; the location
 * service itself re-checks the flag and permissions before recording.
 */
public final class TrackingRestarter {
    private static final String TAG = "TrackingRestarter";
    static final String WATCHDOG_WORK = "jovo-tracking-watchdog";
    /** No native fix for this long while a day is open ⇒ treat service as dead. */
    static final long STALE_FIX_MS = 10L * 60 * 1000;

    private TrackingRestarter() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(BackgroundGeolocationService.NATIVE_HEALTH_PREFS, Context.MODE_PRIVATE);
    }

    static boolean isDayOpen(Context ctx) {
        return BackgroundGeolocationService.isDayOpen(ctx);
    }

    static boolean fixIsStale(Context ctx) {
        long last = prefs(ctx).getLong("lastNativeCallbackAt", 0);
        return System.currentTimeMillis() - last > STALE_FIX_MS;
    }

    /** Start (or poke) the location service. Safe if already running. */
    static boolean startService(Context ctx, String reason) {
        try {
            Intent i = new Intent(ctx, BackgroundGeolocationService.class);
            ContextCompat.startForegroundService(ctx, i);
            prefs(ctx).edit()
                    .putLong("lastRestartAt", System.currentTimeMillis())
                    .putString("lastRestartReason", reason)
                    .apply();
            return true;
        } catch (Exception e) {
            // Android 12+ may refuse a background start (e.g. no battery
            // exemption). The app-side recovery runs on the next open.
            Log.w(TAG, "restart refused (" + reason + ")", e);
            return false;
        }
    }

    static void scheduleWatchdog(Context ctx) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
                TrackingWatchdogWorker.class, 15, TimeUnit.MINUTES).build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                WATCHDOG_WORK, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    static void cancelWatchdog(Context ctx) {
        WorkManager.getInstance(ctx).cancelUniqueWork(WATCHDOG_WORK);
    }
}
