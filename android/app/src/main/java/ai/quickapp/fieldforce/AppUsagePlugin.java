package ai.quickapp.fieldforce;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;

/**
 * Thin JS-facing facade over AppUsageTracker. It holds no state of its own on
 * purpose: if the WebView never loads, or the bridge dies mid-session, the
 * recorder keeps recording and nothing is lost.
 */
@CapacitorPlugin(name = "AppUsage")
public class AppUsagePlugin extends Plugin {

    @PluginMethod
    public void setIdentity(PluginCall call) {
        AppUsageTracker t = AppUsageTracker.get();
        if (t == null) {
            call.reject("app usage tracker not installed");
            return;
        }
        t.setIdentity(call.getString("userId", null));
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /**
     * Phase one of the two-phase drain. The journal is moved aside under a
     * token rather than deleted, so a WebView that dies before the records are
     * queued replays them instead of losing them.
     */
    @PluginMethod
    public void drain(PluginCall call) {
        AppUsageTracker t = AppUsageTracker.get();
        if (t == null) {
            call.reject("app usage tracker not installed");
            return;
        }
        JSObject ret = new JSObject();
        String token = AppUsageJournal.beginDrain(getContext());
        JSArray records = new JSArray();
        if (token != null) {
            List<JSONObject> parsed = AppUsageJournal.read(getContext(), token);
            for (JSONObject o : parsed) records.put(o);
        }
        ret.put("token", token);
        ret.put("records", records);
        try {
            ret.put("state", JSObject.fromJSONObject(t.snapshot()));
        } catch (JSONException e) {
            // Diagnostics only — never fail a drain over the state blob.
            ret.put("state", new JSObject());
        }
        call.resolve(ret);
    }

    /** Phase two: the records are durably queued on the JS side. */
    @PluginMethod
    public void ack(PluginCall call) {
        String token = call.getString("token", null);
        if (token == null) {
            call.reject("token required");
            return;
        }
        AppUsageJournal.ack(getContext(), token);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /** Diagnostics only; no side effects. */
    @PluginMethod
    public void getState(PluginCall call) {
        AppUsageTracker t = AppUsageTracker.get();
        if (t == null) {
            call.reject("app usage tracker not installed");
            return;
        }
        try {
            call.resolve(JSObject.fromJSONObject(t.snapshot()));
        } catch (JSONException e) {
            call.reject("could not read app usage state", e);
        }
    }
}
