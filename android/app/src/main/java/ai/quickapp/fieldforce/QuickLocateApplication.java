package ai.quickapp.fieldforce;

import android.app.ActivityManager;
import android.app.Application;
import android.content.Context;
import android.os.Build;
import android.os.Process;

import java.util.List;

/**
 * Exists for one reason: app-usage tracking has to start with the process, not
 * with an Activity.
 *
 * The location foreground service can bring this process back with no Activity
 * at all. Installing the recorder from MainActivity.onCreate would make every
 * one of those background periods invisible, which is precisely the time we are
 * being asked to measure.
 */
public class QuickLocateApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        // No plugin declares android:process today, but a merged plugin
        // manifest could add one tomorrow, and a second recorder would
        // interleave garbage into the journal.
        if (!isMainProcess(this)) return;
        AppUsageTracker.install(this);
    }

    private static boolean isMainProcess(Context ctx) {
        String name = currentProcessName(ctx);
        return name == null || name.equals(ctx.getPackageName());
    }

    private static String currentProcessName(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return Application.getProcessName();
        }
        ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return null;
        List<ActivityManager.RunningAppProcessInfo> procs = am.getRunningAppProcesses();
        if (procs == null) return null;
        int pid = Process.myPid();
        for (ActivityManager.RunningAppProcessInfo p : procs) {
            if (p.pid == pid) return p.processName;
        }
        return null;
    }
}
