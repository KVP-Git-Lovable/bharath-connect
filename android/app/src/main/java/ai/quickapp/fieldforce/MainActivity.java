package ai.quickapp.fieldforce;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
