package ai.quickapp.fieldforce;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Durable storage for app-usage records.
 *
 * Deliberately mirrors the mechanism the patched background-geolocation
 * service already uses for GPS fixes (append-only JSONL in getFilesDir() plus
 * a SharedPreferences state blob, drained under a static lock): it is the only
 * pattern in this app proven to survive a frozen or dead WebView.
 *
 * One difference from the GPS buffer, and it is intentional. The GPS drain is
 * read-and-delete: losing a handful of fixes out of thousands is tolerable.
 * Losing one usage record loses a whole multi-hour interval, so the drain here
 * is two-phase — drain() moves the journal aside under a token, ack() deletes
 * it, and a journal left inflight by a crashed WebView is replayed on the next
 * drain. That yields at-least-once delivery, which the deterministic row ids
 * computed on the JS side make harmless.
 */
final class AppUsageJournal {

    static final String TAG = "AppUsage";

    /** Guards every read/append/rename of the journal files. */
    static final Object JOURNAL_LOCK = new Object();

    static final String PREFS = "app_usage_state";
    static final String DIR = "app_usage";
    static final String JOURNAL_FILE = "app_usage_journal.jsonl";
    private static final String INFLIGHT_PREFIX = "app_usage_journal.inflight.";
    private static final String INFLIGHT_SUFFIX = ".jsonl";

    /** ~300 bytes per record, so this is months of ordinary use. */
    private static final long JOURNAL_MAX_BYTES = 512 * 1024;

    static final int SCHEMA = 1;

    // --- prefs keys -------------------------------------------------------
    static final String K_SCHEMA = "schema";
    static final String K_DEVICE_ID = "device_id";
    static final String K_INSTALL_ID = "install_id";
    static final String K_SESSION_ID = "session_id";
    static final String K_PID = "pid";
    static final String K_PROCESS_START_WALL = "process_start_wall";
    static final String K_PROCESS_START_ELAPSED = "process_start_elapsed";
    static final String K_BOOT_ID = "boot_id";
    static final String K_BOOT_REF = "boot_ref";
    static final String K_OPEN_STATE = "open_state";
    static final String K_OPEN_START_WALL = "open_start_wall";
    static final String K_OPEN_START_ELAPSED = "open_start_elapsed";
    static final String K_OPEN_USER_ID = "open_user_id";
    static final String K_LAST_ALIVE_WALL = "last_alive_wall";
    static final String K_LAST_ALIVE_ELAPSED = "last_alive_elapsed";
    static final String K_SEQ = "seq";
    static final String K_SUPPRESSED = "suppressed_count";
    static final String K_USER_ID = "user_id";
    static final String K_LAST_EXIT_TS = "last_reconciled_exit_timestamp";

    private AppUsageJournal() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Own directory so Android Auto Backup can exclude the whole thing by
     *  folder rather than by exact filename. */
    static File dir(Context ctx) {
        File d = new File(ctx.getFilesDir(), DIR);
        if (!d.exists() && !d.mkdirs()) Log.w(TAG, "could not create " + DIR);
        return d;
    }

    private static File journal(Context ctx) {
        return new File(dir(ctx), JOURNAL_FILE);
    }

    private static File inflight(Context ctx, String token) {
        return new File(dir(ctx), INFLIGHT_PREFIX + token + INFLIGHT_SUFFIX);
    }

    /**
     * Append one record and fsync it. Called on every lifecycle transition, so
     * the record must be on disk before a kill that happens a millisecond later.
     */
    static void append(Context ctx, JSONObject record) {
        synchronized (JOURNAL_LOCK) {
            File f = journal(ctx);
            if (f.length() > JOURNAL_MAX_BYTES) {
                // Nothing is draining (signed out, or a stuck upload). Stop
                // growing, but count the loss — never silently.
                SharedPreferences p = prefs(ctx);
                p.edit().putInt(K_SUPPRESSED, p.getInt(K_SUPPRESSED, 0) + 1).apply();
                return;
            }
            try (FileOutputStream out = new FileOutputStream(f, true)) {
                out.write((record.toString() + "\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
                out.getFD().sync();
            } catch (IOException e) {
                Log.w(TAG, "journal append failed", e);
            }
        }
    }

    /**
     * Phase one of the drain: adopt any journal left inflight by a previous
     * drain that was never acked, fold the current journal into it, and hand
     * back the token that ack() will need.
     *
     * @return the token, or null when there is nothing to drain.
     */
    static String beginDrain(Context ctx) {
        synchronized (JOURNAL_LOCK) {
            File existing = findInflight(ctx);
            File live = journal(ctx);

            if (existing != null) {
                // A previous drain died before acking. Replay it, and append
                // anything recorded since so ordering is preserved.
                if (live.exists()) {
                    appendFileTo(live, existing);
                    // Best effort: if the concatenation failed we would rather
                    // replay than drop, so only delete once it is folded in.
                    live.delete();
                }
                return tokenOf(existing);
            }

            if (!live.exists() || live.length() == 0) return null;

            String token = UUID.randomUUID().toString();
            File target = inflight(ctx, token);
            if (!live.renameTo(target)) {
                Log.w(TAG, "could not move journal aside for drain");
                return null;
            }
            return token;
        }
    }

    /** Phase two: the records are safely queued on the JS side. */
    static void ack(Context ctx, String token) {
        synchronized (JOURNAL_LOCK) {
            File f = inflight(ctx, token);
            if (f.exists() && !f.delete()) {
                Log.w(TAG, "could not delete inflight journal " + token);
            }
        }
    }

    /** Parse the records held under a drain token. Malformed lines are skipped. */
    static List<JSONObject> read(Context ctx, String token) {
        List<JSONObject> out = new ArrayList<>();
        synchronized (JOURNAL_LOCK) {
            File f = inflight(ctx, token);
            if (!f.exists()) return out;
            try (BufferedReader r = new BufferedReader(new FileReader(f))) {
                String line;
                while ((line = r.readLine()) != null) {
                    if (line.isEmpty()) continue;
                    try {
                        out.add(new JSONObject(line));
                    } catch (JSONException e) {
                        // A torn last line from a kill mid-write. Skip it; the
                        // interval it described is recovered by reconciliation.
                        Log.w(TAG, "skipping malformed journal line");
                    }
                }
            } catch (IOException e) {
                Log.w(TAG, "journal read failed", e);
            }
        }
        return out;
    }

    private static File findInflight(Context ctx) {
        File[] files = dir(ctx).listFiles();
        if (files == null) return null;
        File oldest = null;
        for (File f : files) {
            String n = f.getName();
            if (n.startsWith(INFLIGHT_PREFIX) && n.endsWith(INFLIGHT_SUFFIX)) {
                if (oldest == null || f.lastModified() < oldest.lastModified()) oldest = f;
            }
        }
        return oldest;
    }

    private static String tokenOf(File inflightFile) {
        String n = inflightFile.getName();
        return n.substring(INFLIGHT_PREFIX.length(), n.length() - INFLIGHT_SUFFIX.length());
    }

    private static void appendFileTo(File src, File dst) {
        try (FileOutputStream out = new FileOutputStream(dst, true);
             BufferedReader r = new BufferedReader(new FileReader(src))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isEmpty()) continue;
                out.write((line + "\n").getBytes(StandardCharsets.UTF_8));
            }
            out.flush();
            out.getFD().sync();
        } catch (IOException e) {
            Log.w(TAG, "could not fold journal into inflight", e);
        }
    }
}
