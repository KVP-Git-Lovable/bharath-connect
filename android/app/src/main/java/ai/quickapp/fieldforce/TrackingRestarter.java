package ai.quickapp.fieldforce;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;
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
    private static volatile boolean appVisible;

    private TrackingRestarter() {}

    static void setAppVisible(boolean visible) {
        appVisible = visible;
    }

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
        boolean foregroundLocation = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean backgroundLocation = Build.VERSION.SDK_INT < 29
                || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        PowerManager power = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        boolean batteryExempt = Build.VERSION.SDK_INT < 23
                || (power != null && power.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        boolean bootOrUpdate = Intent.ACTION_BOOT_COMPLETED.equals(reason)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(reason);
        if (!TrackingRestartPolicy.canStart(isDayOpen(ctx), foregroundLocation, Build.VERSION.SDK_INT,
                appVisible, backgroundLocation, batteryExempt, bootOrUpdate)) {
            prefs(ctx).edit().putBoolean("restartDeferred", true)
                    .putString("lastRestartFailure", "Location permission or background-start exemption missing")
                    .putString("lastRestartReason", reason).apply();
            return false;
        }
        try {
            Intent i = new Intent(ctx, BackgroundGeolocationService.class);
            i.setAction(BackgroundGeolocationService.ACTION_RECOVER);
            ContextCompat.startForegroundService(ctx, i);
            prefs(ctx).edit()
                    .putLong("lastRestartAt", System.currentTimeMillis())
                    .putString("lastRestartReason", reason)
                    .putBoolean("restartDeferred", false)
                    .remove("lastRestartFailure")
                    .apply();
            return true;
        } catch (Exception e) {
            // Android 12+ may refuse a background start (e.g. no battery
            // exemption). The app-side recovery runs on the next open.
            Log.w(TAG, "restart refused (" + reason + ")", e);
            prefs(ctx).edit().putBoolean("restartDeferred", true)
                    .putString("lastRestartFailure", e.getClass().getSimpleName() + ": " + e.getMessage())
                    .putString("lastRestartReason", reason).apply();
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
