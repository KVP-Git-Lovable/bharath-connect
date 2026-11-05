package ai.quickapp.fieldforce;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceSettingsPlugin.class);
        registerPlugin(AppUsagePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        TrackingRestarter.setAppVisible(true);
        if (TrackingRestarter.isDayOpen(this)) {
            TrackingRestarter.startService(this, "activity_resume");
        }
    }

    @Override
    public void onPause() {
        TrackingRestarter.setAppVisible(false);
        super.onPause();
    }
}
