package ai.quickapp.fieldforce;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * After a reboot (or app update), resume tracking if an attendance day was
 * still open. The open/closed flag is written by the app at check-in and
 * check-out and expires after 16 hours, matching the app's auto-stop.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        if (!TrackingRestarter.isDayOpen(ctx)) return;
        TrackingRestarter.startService(ctx, action);
        TrackingRestarter.scheduleWatchdog(ctx);
    }
}
