package ai.quickapp.fieldforce;

import org.junit.Test;
import static org.junit.Assert.*;

public class TrackingRestartPolicyTest {
    @Test public void visibleAppCanStartWithWhileUsingPermissionOnAndroid15() {
        assertTrue(TrackingRestartPolicy.canStart(true, true, 35, true, false, false, false));
    }
    @Test public void closedDayNeverRestarts() {
        assertFalse(TrackingRestartPolicy.canStart(false, true, 35, true, true, true, true));
    }
    @Test public void missingLocationNeverRestarts() {
        assertFalse(TrackingRestartPolicy.canStart(true, false, 35, true, true, true, true));
    }
    @Test public void backgroundPermissionAloneIsNotStartExemption() {
        assertFalse(TrackingRestartPolicy.canStart(true, true, 35, false, true, false, false));
    }
    @Test public void batteryExemptionDoesNotReplaceBackgroundLocation() {
        assertFalse(TrackingRestartPolicy.canStart(true, true, 35, false, false, true, false));
    }
    @Test public void watchdogCanRestartWithBothExemptions() {
        assertTrue(TrackingRestartPolicy.canStart(true, true, 35, false, true, true, false));
    }
    @Test public voidBootNeedsBackgroundLocation() {
        assertFalse(TrackingRestartPolicy.canStart(true, true, 35, false, false, false, true));
    }
    @Test public void bootIsStartExemptionWithBackgroundLocation() {
        assertTrue(TrackingRestartPolicy.canStart(true, true, 35, false, true, false, true));
    }
    @Test public void android10CanRestartWithBackgroundLocationWithoutBatteryExemption() {
        assertTrue(TrackingRestartPolicy.canStart(true, true, 29, false, true, false, false));
    }
    @Test public void android9DoesNotRequireBackgroundLocation() {
        assertTrue(TrackingRestartPolicy.canStart(true, true, 28, false, false, false, false));
    }
}