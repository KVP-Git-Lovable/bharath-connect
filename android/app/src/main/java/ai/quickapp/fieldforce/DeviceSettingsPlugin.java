package ai.quickapp.fieldforce;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "DeviceSettings",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
            alias = "backgroundLocation"
        )
    }
)
public class DeviceSettingsPlugin extends Plugin {
    private String permissionState(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED
            ? "granted"
            : "denied";
    }

    private boolean isIgnoringBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return powerManager != null && powerManager.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private JSObject currentStatus() {
        JSObject result = new JSObject();
        boolean foregroundGranted =
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;

        String backgroundState = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? permissionState(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            : (foregroundGranted ? "granted" : "denied");

        result.put("foregroundLocation", foregroundGranted ? "granted" : "denied");
        result.put("backgroundLocation", backgroundState);
        result.put("ignoringBatteryOptimizations", isIgnoringBatteryOptimizations());
        result.put("sdkInt", Build.VERSION.SDK_INT);
        return result;
    }

    @PluginMethod
    public void getLocationPowerStatus(PluginCall call) {
        call.resolve(currentStatus());
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || isIgnoringBatteryOptimizations()) {
            JSObject result = currentStatus();
            result.put("opened", false);
            call.resolve(result);
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);

            JSObject result = currentStatus();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception requestError) {
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                getActivity().startActivity(fallback);

                JSObject result = currentStatus();
                result.put("opened", true);
                call.resolve(result);
            } catch (Exception fallbackError) {
                call.reject("Could not open battery optimisation settings", fallbackError);
            }
        }
    }

    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            JSObject result = currentStatus();
            result.put("opened", false);
            call.resolve(result);
            return;
        }

        if (getPermissionState("backgroundLocation") == PermissionState.GRANTED) {
            JSObject result = currentStatus();
            result.put("opened", false);
            call.resolve(result);
            return;
        }

        if (Build.VERSION.SDK_INT == Build.VERSION_CODES.Q) {
            requestPermissionForAlias("backgroundLocation", call, "backgroundLocationCallback");
            return;
        }

        openAppSettings(call);
    }

    @PermissionCallback
    private void backgroundLocationCallback(PluginCall call) {
        JSObject result = currentStatus();
        result.put("opened", false);
        call.resolve(result);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);

            JSObject result = currentStatus();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not open app settings", error);
        }
    }

    /**
     * OEM "autostart" / "protected apps" screens. Xiaomi, Oppo, Vivo, Realme
     * and friends kill background foreground-services unless the app is
     * whitelisted here, which is what silently stops day tracking. Android
     * exposes no API for it, so the known component names are tried in turn
     * and we fall back to the app details screen.
     */
    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        String[][] targets = new String[][] {
            { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
            { "com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity" },
            { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
            { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
            { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
            { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity" },
            { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager" },
            { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
            { "com.asus.mobilemanager", "com.asus.mobilemanager.entry.FunctionActivity" },
            { "com.htc.pitroad", "com.htc.pitroad.landingpage.activity.LandingPageActivity" },
            { "com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity" },
            { "com.transsion.phonemanager", "com.itel.autobootmanager.activity.AutoBootMgrActivity" }
        };

        PackageManager pm = getContext().getPackageManager();
        for (String[] target : targets) {
            try {
                Intent intent = new Intent();
                intent.setComponent(new android.content.ComponentName(target[0], target[1]));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) == null) continue;
                getActivity().startActivity(intent);

                JSObject result = currentStatus();
                result.put("opened", true);
                result.put("target", target[0]);
                call.resolve(result);
                return;
            } catch (Exception ignored) {
                // try the next OEM component
            }
        }

        // No OEM screen on this device (stock Android) — app details is the
        // closest useful destination.
        openAppSettings(call);
    }
}
