package ai.quickapp.fieldforce;

import android.app.ActivityManager;
import android.app.Application;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.ProcessLifecycleOwner;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/**
 * Records how long this process spends in the foreground and in the background,
 * per signed-in user, durably enough to survive its own death.
 *
 * Three states exist, and only two of them are ever written:
 *
 *   foreground  - an Activity is started (visible to the user)
 *   background  - the process is alive but no Activity is started
 *   not running - no process at all; NEVER stored, it is the gap between rows
 *
 * Not storing "not running" is what keeps background time honest: it can only
 * ever be time the process was actually alive, so a phone left in a drawer
 * overnight after a force stop contributes nothing.
 *
 * Why ON_START/ON_STOP rather than ON_RESUME/ON_PAUSE: start/stop is Android's
 * visible lifetime, resume/pause is "topmost". This app throws a lot of
 * permission dialogs (see DeviceSettingsPlugin) and each one pauses without
 * stopping. Using resume/pause would shred the interval stream into fake
 * background segments. Resume/pause is still measured, but only as the
 * interactiveMs accumulator carried on the foreground interval.
 */
final class AppUsageTracker {

    private static final String TAG = AppUsageJournal.TAG;

    /**
     * Android pauses and stops us for camera intents, keyboards and permission
     * dialogs. Without this, one launch can emit dozens of interval pairs. A
     * background gap shorter than this does not close the foreground interval;
     * it is absorbed, and the foreground interval simply continues.
     */
    private static final long MIN_BACKGROUND_MS = 3_000L;

    /** Foreground-only. The background case is covered by the GPS service's own
     *  heartbeat (read-only) plus reconciliation, so we cost nothing when the
     *  app is not in front and Doze cannot break us. */
    private static final long HEARTBEAT_MS = 60_000L;

    /** Wall-vs-monotonic disagreement above this is a clock change worth flagging. */
    private static final long CLOCK_JUMP_TOLERANCE_MS = 5_000L;

    /** Boot identity tolerance: elapsedRealtime drifts against wall clock slowly. */
    private static final long BOOT_REF_TOLERANCE_MS = 3_000L;

    /** Written by the patched BackgroundGeolocationService on every real fix. */
    private static final String GPS_HEALTH_PREFS = "gps_native_health";
    private static final String GPS_LAST_CALLBACK = "lastNativeCallbackAt";
    private static final long GPS_RECENT_MS = 120_000L;

    // Prefs keys owned by the tracker (the rest live on AppUsageJournal).
    private static final String K_PENDING_FG_START_WALL = "pending_fg_start_wall";
    private static final String K_PENDING_FG_START_ELAPSED = "pending_fg_start_elapsed";
    private static final String K_PENDING_FG_INTERACTIVE = "pending_fg_interactive_ms";
    private static final String K_PENDING_FG_COALESCED = "pending_fg_coalesced";
    private static final String K_PENDING_FG_USER = "pending_fg_user";
    private static final String K_CLOSE_INTENT = "close_intent";

    private static volatile AppUsageTracker instance;

    private final Context ctx;
    private final SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final String appVersion;
    private final String osVersion;
    private final String deviceModel;

    private String sessionId;
    private String deviceId;
    private String bootId;

    /** Wall/elapsed captured in ActivityLifecycleCallbacks, NOT inside the
     *  ProcessLifecycleOwner callbacks: ON_STOP there is debounced by 700ms,
     *  which would inflate every foreground interval by that much. */
    private long lastStartedWall, lastStartedElapsed;
    private long lastStoppedWall, lastStoppedElapsed;

    private long resumedAtElapsed = -1;
    private long interactiveMs = 0;
    private int coalescedCount = 0;

    private boolean foreground = false;

    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            prefs.edit()
                .putLong(AppUsageJournal.K_LAST_ALIVE_WALL, System.currentTimeMillis())
                .putLong(AppUsageJournal.K_LAST_ALIVE_ELAPSED, SystemClock.elapsedRealtime())
                .apply();
            handler.postDelayed(this, HEARTBEAT_MS);
        }
    };

    /** Fires when a background gap has outlived the coalescing window. */
    private final Runnable flushPendingForeground = () -> flushPendingForeground(false);

    private AppUsageTracker(Context context) {
        this.ctx = context.getApplicationContext();
        this.prefs = AppUsageJournal.prefs(this.ctx);
        this.appVersion = readAppVersion(this.ctx);
        this.osVersion = Build.VERSION.RELEASE;
        this.deviceModel = Build.MANUFACTURER + " " + Build.MODEL;
    }

    static AppUsageTracker get() {
        return instance;
    }

    /**
     * Installed from the Application, not from MainActivity. When the process is
     * restarted in the background by the location foreground service no Activity
     * is created, and registering in MainActivity.onCreate would make every one
     * of those background periods invisible.
     */
    static synchronized void install(Application app) {
        if (instance != null) return;
        AppUsageTracker t = new AppUsageTracker(app);
        instance = t;

        app.registerActivityLifecycleCallbacks(t.activityCallbacks);

        // Reconcile the previous process BEFORE opening this one's first
        // interval, so the journal stays chronological.
        try {
            t.reconcilePreviousProcess();
        } catch (Exception e) {
            Log.w(TAG, "reconciliation failed", e);
        }
        t.startSession();

        ProcessLifecycleOwner.get().getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override public void onStart(@NonNull LifecycleOwner owner) { t.onProcessForeground(); }
            @Override public void onStop(@NonNull LifecycleOwner owner) { t.onProcessBackground(); }
        });
    }

    // ------------------------------------------------------------------ setup

    private void startSession() {
        long wall = System.currentTimeMillis();
        long elapsed = SystemClock.elapsedRealtime();

        sessionId = UUID.randomUUID().toString();
        deviceId = prefs.getString(AppUsageJournal.K_DEVICE_ID, null);
        if (deviceId == null) deviceId = UUID.randomUUID().toString();
        bootId = resolveBootId(wall, elapsed);

        String installId = prefs.getString(AppUsageJournal.K_INSTALL_ID, null);
        if (installId == null) installId = UUID.randomUUID().toString();

        prefs.edit()
            .putInt(AppUsageJournal.K_SCHEMA, AppUsageJournal.SCHEMA)
            .putString(AppUsageJournal.K_DEVICE_ID, deviceId)
            .putString(AppUsageJournal.K_INSTALL_ID, installId)
            .putString(AppUsageJournal.K_SESSION_ID, sessionId)
            .putInt(AppUsageJournal.K_PID, Process.myPid())
            .putLong(AppUsageJournal.K_PROCESS_START_WALL, wall)
            .putLong(AppUsageJournal.K_PROCESS_START_ELAPSED, elapsed)
            .putString(AppUsageJournal.K_BOOT_ID, bootId)
            .putLong(AppUsageJournal.K_LAST_ALIVE_WALL, wall)
            .putLong(AppUsageJournal.K_LAST_ALIVE_ELAPSED, elapsed)
            .putLong(AppUsageJournal.K_SEQ, 0)
            // The process exists before any Activity does, so it opens in the
            // background. ON_START closes this a moment later on a cold launch.
            .putString(AppUsageJournal.K_OPEN_STATE, "background")
            .putLong(AppUsageJournal.K_OPEN_START_WALL, wall)
            .putLong(AppUsageJournal.K_OPEN_START_ELAPSED, elapsed)
            .remove(K_PENDING_FG_START_WALL)
            .remove(K_PENDING_FG_START_ELAPSED)
            .remove(K_PENDING_FG_INTERACTIVE)
            .remove(K_PENDING_FG_COALESCED)
            .remove(K_PENDING_FG_USER)
            .remove(K_CLOSE_INTENT)
            .commit();

        JSONObject rec = base("process_start", wall, elapsed);
        put(rec, "pid", Process.myPid());
        AppUsageJournal.append(ctx, rec);

        writeProcessStateSummary("background", wall, elapsed);
    }

    private String resolveBootId(long wall, long elapsed) {
        long ref = Math.round((wall - elapsed) / 1000.0) * 1000L;
        long stored = prefs.getLong(AppUsageJournal.K_BOOT_REF, 0);
        String storedId = prefs.getString(AppUsageJournal.K_BOOT_ID, null);
        String id;
        if (storedId != null && stored != 0 && Math.abs(stored - ref) <= BOOT_REF_TOLERANCE_MS) {
            id = storedId;
        } else {
            id = UUID.randomUUID().toString();
        }
        prefs.edit().putLong(AppUsageJournal.K_BOOT_REF, ref).putString(AppUsageJournal.K_BOOT_ID, id).apply();
        return id;
    }

    // ------------------------------------------------------- lifecycle edges

    private void onProcessForeground() {
        long wall = lastStartedWall != 0 ? lastStartedWall : System.currentTimeMillis();
        long elapsed = lastStartedElapsed != 0 ? lastStartedElapsed : SystemClock.elapsedRealtime();
        foreground = true;
        handler.removeCallbacks(flushPendingForeground);

        long pendingFgWall = prefs.getLong(K_PENDING_FG_START_WALL, 0);
        long gapMs = elapsed - prefs.getLong(AppUsageJournal.K_OPEN_START_ELAPSED, elapsed);

        if (pendingFgWall != 0 && gapMs < MIN_BACKGROUND_MS) {
            // A dialog, a camera intent, a keyboard. Absorb it: the foreground
            // interval never actually ended.
            coalescedCount = prefs.getInt(K_PENDING_FG_COALESCED, 0) + 1;
            interactiveMs = prefs.getLong(K_PENDING_FG_INTERACTIVE, 0);
            prefs.edit()
                .putString(AppUsageJournal.K_OPEN_STATE, "foreground")
                .putLong(AppUsageJournal.K_OPEN_START_WALL, pendingFgWall)
                .putLong(AppUsageJournal.K_OPEN_START_ELAPSED, prefs.getLong(K_PENDING_FG_START_ELAPSED, elapsed))
                .putInt(K_PENDING_FG_COALESCED, coalescedCount)
                .remove(K_PENDING_FG_START_WALL)
                .remove(K_PENDING_FG_START_ELAPSED)
                .commit();
            startHeartbeat();
            writeProcessStateSummary("foreground", pendingFgWall, prefs.getLong(K_PENDING_FG_START_ELAPSED, elapsed));
            return;
        }

        // A real background period ends here.
        flushPendingForeground(true);
        closeOpenInterval("background", wall, elapsed, "observed", "observed", "resume", 0);
        openInterval("foreground", wall, elapsed);
        interactiveMs = 0;
        coalescedCount = 0;
        startHeartbeat();
    }

    private void onProcessBackground() {
        long wall = lastStoppedWall != 0 ? lastStoppedWall : System.currentTimeMillis();
        long elapsed = lastStoppedElapsed != 0 ? lastStoppedElapsed : SystemClock.elapsedRealtime();
        foreground = false;
        stopHeartbeat();

        accumulateInteractive(elapsed);

        // Hold the foreground interval open for the coalescing window, but make
        // the intent durable right now: if we are killed inside the window,
        // reconciliation finds both halves in prefs and writes them correctly.
        prefs.edit()
            .putLong(K_PENDING_FG_START_WALL, prefs.getLong(AppUsageJournal.K_OPEN_START_WALL, wall))
            .putLong(K_PENDING_FG_START_ELAPSED, prefs.getLong(AppUsageJournal.K_OPEN_START_ELAPSED, elapsed))
            .putLong(K_PENDING_FG_INTERACTIVE, interactiveMs)
            .putInt(K_PENDING_FG_COALESCED, coalescedCount)
            .putString(K_PENDING_FG_USER, prefs.getString(AppUsageJournal.K_USER_ID, null))
            .putString(AppUsageJournal.K_OPEN_STATE, "background")
            .putLong(AppUsageJournal.K_OPEN_START_WALL, wall)
            .putLong(AppUsageJournal.K_OPEN_START_ELAPSED, elapsed)
            .commit();

        writeProcessStateSummary("background", wall, elapsed);
        handler.postDelayed(flushPendingForeground, MIN_BACKGROUND_MS);
    }

    /** Write the deferred foreground interval once the gap proved to be real. */
    private void flushPendingForeground(boolean immediate) {
        long startWall = prefs.getLong(K_PENDING_FG_START_WALL, 0);
        if (startWall == 0) return;
        long startElapsed = prefs.getLong(K_PENDING_FG_START_ELAPSED, 0);
        long endWall = prefs.getLong(AppUsageJournal.K_OPEN_START_WALL, System.currentTimeMillis());
        long endElapsed = prefs.getLong(AppUsageJournal.K_OPEN_START_ELAPSED, SystemClock.elapsedRealtime());

        String endReason = prefs.getString(K_CLOSE_INTENT, null);
        if (endReason == null) endReason = "app_switch";

        appendInterval("foreground", prefs.getString(K_PENDING_FG_USER, null),
            startWall, startElapsed, endWall, endElapsed,
            "observed", "observed", "resume", endReason,
            prefs.getLong(K_PENDING_FG_INTERACTIVE, 0),
            prefs.getInt(K_PENDING_FG_COALESCED, 0), 0);

        prefs.edit()
            .remove(K_PENDING_FG_START_WALL)
            .remove(K_PENDING_FG_START_ELAPSED)
            .remove(K_PENDING_FG_INTERACTIVE)
            .remove(K_PENDING_FG_COALESCED)
            .remove(K_PENDING_FG_USER)
            .remove(K_CLOSE_INTENT)
            .commit();
    }

    // ------------------------------------------------------------- identity

    /**
     * An interval is never split across two users. Signing out closes the
     * current one and opens a fresh one under the new identity.
     */
    void setIdentity(String userId) {
        String current = prefs.getString(AppUsageJournal.K_USER_ID, null);
        if (eq(current, userId)) return;

        long wall = System.currentTimeMillis();
        long elapsed = SystemClock.elapsedRealtime();

        flushPendingForeground(true);
        String state = prefs.getString(AppUsageJournal.K_OPEN_STATE, "background");
        closeOpenInterval(state, wall, elapsed, "observed", "observed", "identity_change", 0);

        prefs.edit().putString(AppUsageJournal.K_USER_ID, userId).commit();

        JSONObject rec = base("identity", wall, elapsed);
        put(rec, "user_id", userId);
        AppUsageJournal.append(ctx, rec);

        openInterval(state, wall, elapsed);
        interactiveMs = 0;
        coalescedCount = 0;
    }

    // ------------------------------------------------------- reconciliation

    /**
     * Close whatever the previous process left open. The true death time is
     * knowable on API 30+ via ApplicationExitInfo and merely boundable below
     * that, so every reconciled interval carries its confidence and, when
     * inferred, how wide the window was.
     */
    private void reconcilePreviousProcess() {
        String prevSession = prefs.getString(AppUsageJournal.K_SESSION_ID, null);
        if (prevSession == null) return; // first ever launch

        long nowWall = System.currentTimeMillis();
        long openStartWall = prefs.getLong(AppUsageJournal.K_OPEN_START_WALL, 0);
        long pendingFgWall = prefs.getLong(K_PENDING_FG_START_WALL, 0);
        if (openStartWall == 0 && pendingFgWall == 0) return;

        String openState = prefs.getString(AppUsageJournal.K_OPEN_STATE, "background");
        int prevPid = prefs.getInt(AppUsageJournal.K_PID, -1);

        ExitEvidence exit = findExitEvidence(prevPid, openStartWall, nowWall);

        // Lower bound on the death time: the latest moment we can prove the
        // process was still alive. Our own heartbeat only runs in the
        // foreground, so for the background case we lean on the GPS service's
        // heartbeat, which is written on every real fix.
        long lastAlive = Math.max(
            prefs.getLong(AppUsageJournal.K_LAST_ALIVE_WALL, 0),
            gpsLastCallbackAt());
        long lowerBound = Math.max(lastAlive, Math.max(openStartWall, pendingFgWall));

        // Upper bound: this process starting, or the reboot if there was one.
        boolean rebooted = bootChangedSince(nowWall);
        long upperBound = nowWall;

        long endWall;
        String confidence;
        String endReason;
        if (exit != null && exit.timestamp >= lowerBound && exit.timestamp <= upperBound) {
            endWall = exit.timestamp;
            confidence = "exit_record";
            endReason = exit.reasonName;
        } else {
            endWall = lowerBound;
            confidence = "inferred";
            endReason = rebooted ? "reconciled_reboot" : "unknown";
        }
        long uncertainty = Math.max(0, upperBound - endWall);
        if ("exit_record".equals(confidence)) uncertainty = 0;

        String prevUser = prefs.getString(AppUsageJournal.K_USER_ID, null);

        // A process killed inside the coalescing window left a foreground
        // interval that was never written. Write it first, observed, then the
        // background interval that followed it.
        if (pendingFgWall != 0) {
            appendInterval("foreground", prefs.getString(K_PENDING_FG_USER, prevUser),
                pendingFgWall, prefs.getLong(K_PENDING_FG_START_ELAPSED, 0),
                openStartWall, prefs.getLong(AppUsageJournal.K_OPEN_START_ELAPSED, 0),
                "observed", "observed", "resume", "app_switch",
                prefs.getLong(K_PENDING_FG_INTERACTIVE, 0),
                prefs.getInt(K_PENDING_FG_COALESCED, 0), 0);
            openState = "background";
        }

        appendInterval(openState, prevUser,
            openStartWall, prefs.getLong(AppUsageJournal.K_OPEN_START_ELAPSED, 0),
            endWall, 0,
            "reconciled", confidence, "resume", endReason,
            0, 0, uncertainty);

        JSONObject rec = base("exit", endWall, 0);
        put(rec, "of_session", prevSession);
        put(rec, "of_pid", prevPid);
        put(rec, "end_confidence", confidence);
        put(rec, "end_reason", endReason);
        put(rec, "uncertainty_ms", uncertainty);
        if (exit != null) {
            put(rec, "reason_code", exit.reason);
            put(rec, "importance", exit.importance);
            put(rec, "match", exit.match);
            put(rec, "description", exit.description);
        }
        AppUsageJournal.append(ctx, rec);
    }

    private boolean bootChangedSince(long nowWall) {
        long ref = Math.round((nowWall - SystemClock.elapsedRealtime()) / 1000.0) * 1000L;
        long stored = prefs.getLong(AppUsageJournal.K_BOOT_REF, 0);
        return stored != 0 && Math.abs(stored - ref) > BOOT_REF_TOLERANCE_MS;
    }

    private long gpsLastCallbackAt() {
        try {
            return ctx.getSharedPreferences(GPS_HEALTH_PREFS, Context.MODE_PRIVATE)
                      .getLong(GPS_LAST_CALLBACK, 0);
        } catch (Exception e) {
            return 0;
        }
    }

    private boolean gpsServiceRecent() {
        long last = gpsLastCallbackAt();
        return last > 0 && System.currentTimeMillis() - last <= GPS_RECENT_MS;
    }

    private static final class ExitEvidence {
        long timestamp; int reason; int importance; String reasonName; String match; String description;
    }

    /**
     * Match an exit record to the interval the previous process left open.
     * getProcessStateSummary is the exact key: we stamp the open interval into
     * it on every transition, and the system hands the bytes back with the
     * record. Pid and a timestamp window are the fallbacks.
     */
    private ExitEvidence findExitEvidence(int prevPid, long openStartWall, long nowWall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null;
        try {
            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return null;
            List<ApplicationExitInfo> infos =
                am.getHistoricalProcessExitReasons(ctx.getPackageName(), 0, 16);
            if (infos == null || infos.isEmpty()) return null;

            long alreadySeen = prefs.getLong(AppUsageJournal.K_LAST_EXIT_TS, 0);
            ExitEvidence best = null;

            for (ApplicationExitInfo info : infos) {
                long ts = info.getTimestamp();
                if (ts <= alreadySeen) continue;
                if (ts < openStartWall || ts > nowWall) continue;

                String match = null;
                byte[] summary = info.getProcessStateSummary();
                if (summary != null && summary.length > 0) {
                    String s = new String(summary, StandardCharsets.UTF_8);
                    if (s.contains(shortId(prefs.getString(AppUsageJournal.K_SESSION_ID, "")))) {
                        match = "summary";
                    }
                }
                if (match == null && prevPid > 0 && info.getPid() == prevPid) match = "pid";
                if (match == null) match = "heuristic";

                if (best == null || ts > best.timestamp || "summary".equals(match)) {
                    ExitEvidence e = new ExitEvidence();
                    e.timestamp = ts;
                    e.reason = info.getReason();
                    e.importance = info.getImportance();
                    e.reasonName = mapExitReason(info.getReason());
                    e.match = match;
                    e.description = info.getDescription();
                    best = e;
                    if ("summary".equals(match)) break;
                }
            }
            if (best != null) {
                prefs.edit().putLong(AppUsageJournal.K_LAST_EXIT_TS, best.timestamp).apply();
            }
            return best;
        } catch (Exception e) {
            Log.w(TAG, "exit reason lookup failed", e);
            return null;
        }
    }

    private static String mapExitReason(int reason) {
        switch (reason) {
            case ApplicationExitInfo.REASON_EXIT_SELF: return "normal_exit";
            case ApplicationExitInfo.REASON_SIGNALED: return "signaled";
            case ApplicationExitInfo.REASON_LOW_MEMORY: return "os_kill_memory";
            case ApplicationExitInfo.REASON_CRASH: return "crash";
            case ApplicationExitInfo.REASON_CRASH_NATIVE: return "crash_native";
            case ApplicationExitInfo.REASON_ANR: return "anr";
            case ApplicationExitInfo.REASON_INITIALIZATION_FAILURE: return "init_failure";
            case ApplicationExitInfo.REASON_PERMISSION_CHANGE: return "permission_change";
            case ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE: return "os_kill_resources";
            case ApplicationExitInfo.REASON_USER_REQUESTED: return "removed_from_recents";
            case ApplicationExitInfo.REASON_USER_STOPPED: return "force_stop";
            case ApplicationExitInfo.REASON_DEPENDENCY_DIED: return "dependency_died";
            case ApplicationExitInfo.REASON_OTHER: return "os_kill_other";
            case 14: return "os_kill_freezer";            // REASON_FREEZER, API 31+
            case 15: case 16: return "app_update";        // PACKAGE_STATE_CHANGE / PACKAGE_UPDATED
            default: return "unknown";
        }
    }

    /**
     * Stamp the open interval where the system will hand it back to us with the
     * exit record. 128 bytes, API 30+.
     */
    private void writeProcessStateSummary(String state, long startWall, long startElapsed) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;
        try {
            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return;
            String s = AppUsageJournal.SCHEMA + "|" + ("foreground".equals(state) ? "fg" : "bg")
                + "|" + startWall + "|" + startElapsed
                + "|" + shortId(sessionId)
                + "|" + shortId(prefs.getString(AppUsageJournal.K_USER_ID, ""));
            byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > 128) return;
            am.setProcessStateSummary(bytes);
        } catch (Exception e) {
            Log.w(TAG, "setProcessStateSummary failed", e);
        }
    }

    private static String shortId(String id) {
        if (id == null || id.isEmpty()) return "-";
        return id.length() <= 8 ? id : id.substring(0, 8);
    }

    // -------------------------------------------------------- interval plumbing

    private void openInterval(String state, long wall, long elapsed) {
        prefs.edit()
            .putString(AppUsageJournal.K_OPEN_STATE, state)
            .putLong(AppUsageJournal.K_OPEN_START_WALL, wall)
            .putLong(AppUsageJournal.K_OPEN_START_ELAPSED, elapsed)
            .putString(AppUsageJournal.K_OPEN_USER_ID, prefs.getString(AppUsageJournal.K_USER_ID, null))
            .commit();
        writeProcessStateSummary(state, wall, elapsed);
    }

    private void closeOpenInterval(String state, long endWall, long endElapsed,
                                   String source, String confidence,
                                   String startReason, String endReason, long uncertainty) {
        long startWall = prefs.getLong(AppUsageJournal.K_OPEN_START_WALL, 0);
        if (startWall == 0) return;
        appendInterval(state, prefs.getString(AppUsageJournal.K_USER_ID, null),
            startWall, prefs.getLong(AppUsageJournal.K_OPEN_START_ELAPSED, 0),
            endWall, endElapsed, source, confidence, startReason, endReason,
            "foreground".equals(state) ? interactiveMs : 0, coalescedCount, uncertainty);
    }

    private void closeOpenInterval(String state, long endWall, long endElapsed,
                                   String source, String confidence,
                                   String endReason, long uncertainty) {
        closeOpenInterval(state, endWall, endElapsed, source, confidence, "resume", endReason, uncertainty);
    }

    private void appendInterval(String kind, String userId,
                                long startWall, long startElapsed,
                                long endWall, long endElapsed,
                                String source, String confidence,
                                String startReason, String endReason,
                                long interactive, int coalesced, long uncertainty) {
        if (startWall <= 0 || endWall < startWall) return;

        long seq = prefs.getLong(AppUsageJournal.K_SEQ, 0) + 1;
        prefs.edit().putLong(AppUsageJournal.K_SEQ, seq).apply();

        long wallDelta = endWall - startWall;
        long elapsedDelta = (startElapsed > 0 && endElapsed > 0) ? endElapsed - startElapsed : -1;
        long jump = elapsedDelta >= 0 ? wallDelta - elapsedDelta : 0;
        if (Math.abs(jump) < CLOCK_JUMP_TOLERANCE_MS) jump = 0;

        JSONObject rec = base("interval", startWall, startElapsed);
        put(rec, "seq", seq);
        put(rec, "kind", kind);
        put(rec, "user_id", userId);
        put(rec, "start_wall", startWall);
        put(rec, "start_elapsed", startElapsed);
        put(rec, "end_wall", endWall);
        put(rec, "end_elapsed", endElapsed);
        // elapsedRealtime is monotonic and counts while the device sleeps, so it
        // is the trustworthy duration whenever both ends share a boot.
        put(rec, "duration_ms", elapsedDelta >= 0 ? elapsedDelta : Math.max(0, wallDelta));
        put(rec, "interactive_ms", interactive);
        put(rec, "coalesced_count", coalesced);
        put(rec, "source", source);
        put(rec, "end_confidence", confidence);
        put(rec, "uncertainty_ms", uncertainty);
        put(rec, "start_reason", startReason);
        put(rec, "end_reason", endReason);
        put(rec, "clock_jump_ms", jump);
        put(rec, "gps_service_recent", gpsServiceRecent());
        AppUsageJournal.append(ctx, rec);
    }

    private JSONObject base(String type, long wall, long elapsed) {
        JSONObject o = new JSONObject();
        put(o, "v", AppUsageJournal.SCHEMA);
        put(o, "t", type);
        put(o, "session_id", sessionId != null ? sessionId : prefs.getString(AppUsageJournal.K_SESSION_ID, null));
        put(o, "device_id", deviceId != null ? deviceId : prefs.getString(AppUsageJournal.K_DEVICE_ID, null));
        put(o, "boot_id", bootId != null ? bootId : prefs.getString(AppUsageJournal.K_BOOT_ID, null));
        put(o, "wall", wall);
        put(o, "elapsed", elapsed);
        put(o, "app_version", appVersion);
        put(o, "os_version", osVersion);
        put(o, "device_model", deviceModel);
        put(o, "platform", "android");
        return o;
    }

    private static void put(JSONObject o, String k, Object v) {
        try {
            o.put(k, v == null ? JSONObject.NULL : v);
        } catch (JSONException ignored) {
        }
    }

    private static boolean eq(String a, String b) {
        return a == null ? b == null : a.equals(b);
    }

    private static String readAppVersion(Context ctx) {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    // ------------------------------------------------------------- heartbeat

    private void startHeartbeat() {
        handler.removeCallbacks(heartbeat);
        handler.post(heartbeat);
    }

    private void stopHeartbeat() {
        handler.removeCallbacks(heartbeat);
    }

    private void accumulateInteractive(long nowElapsed) {
        if (resumedAtElapsed > 0) {
            interactiveMs += Math.max(0, nowElapsed - resumedAtElapsed);
            resumedAtElapsed = -1;
        }
    }

    // ------------------------------------------------------------- state read

    JSONObject snapshot() {
        JSONObject o = new JSONObject();
        put(o, "schema", prefs.getInt(AppUsageJournal.K_SCHEMA, AppUsageJournal.SCHEMA));
        put(o, "openState", prefs.getString(AppUsageJournal.K_OPEN_STATE, null));
        put(o, "openStartWall", prefs.getLong(AppUsageJournal.K_OPEN_START_WALL, 0));
        put(o, "openStartElapsed", prefs.getLong(AppUsageJournal.K_OPEN_START_ELAPSED, 0));
        put(o, "userId", prefs.getString(AppUsageJournal.K_USER_ID, null));
        put(o, "deviceId", prefs.getString(AppUsageJournal.K_DEVICE_ID, null));
        put(o, "installId", prefs.getString(AppUsageJournal.K_INSTALL_ID, null));
        put(o, "sessionId", prefs.getString(AppUsageJournal.K_SESSION_ID, null));
        put(o, "bootId", prefs.getString(AppUsageJournal.K_BOOT_ID, null));
        put(o, "pid", prefs.getInt(AppUsageJournal.K_PID, -1));
        put(o, "processStartWall", prefs.getLong(AppUsageJournal.K_PROCESS_START_WALL, 0));
        put(o, "lastAliveWall", prefs.getLong(AppUsageJournal.K_LAST_ALIVE_WALL, 0));
        put(o, "suppressedCount", prefs.getInt(AppUsageJournal.K_SUPPRESSED, 0));
        put(o, "foreground", foreground);
        put(o, "appVersion", appVersion);
        put(o, "osVersion", osVersion);
        put(o, "deviceModel", deviceModel);
        return o;
    }

    // --------------------------------------------- activity-level timestamps

    private final Application.ActivityLifecycleCallbacks activityCallbacks =
        new Application.ActivityLifecycleCallbacks() {
            @Override public void onActivityCreated(@NonNull android.app.Activity a, Bundle b) {}

            @Override public void onActivityStarted(@NonNull android.app.Activity a) {
                lastStartedWall = System.currentTimeMillis();
                lastStartedElapsed = SystemClock.elapsedRealtime();
            }

            @Override public void onActivityResumed(@NonNull android.app.Activity a) {
                resumedAtElapsed = SystemClock.elapsedRealtime();
            }

            @Override public void onActivityPaused(@NonNull android.app.Activity a) {
                accumulateInteractive(SystemClock.elapsedRealtime());
            }

            @Override public void onActivityStopped(@NonNull android.app.Activity a) {
                // ProcessLifecycleOwner debounces ON_STOP by 700ms. Stamping the
                // interval end there would add that to every transition, which
                // for a rep switching apps 200 times a day is minutes of
                // fabricated foreground time. Take the timestamp here instead.
                lastStoppedWall = System.currentTimeMillis();
                lastStoppedElapsed = SystemClock.elapsedRealtime();
            }

            @Override public void onActivitySaveInstanceState(@NonNull android.app.Activity a, @NonNull Bundle b) {}

            @Override public void onActivityDestroyed(@NonNull android.app.Activity a) {
                // The only honest signal for "the user meant to close the app".
                // The process usually survives this, so it labels the interval
                // rather than ending the session.
                if (a.isFinishing() && !a.isChangingConfigurations()) {
                    prefs.edit().putString(K_CLOSE_INTENT, "normal_close").apply();
                }
            }
        };
}
