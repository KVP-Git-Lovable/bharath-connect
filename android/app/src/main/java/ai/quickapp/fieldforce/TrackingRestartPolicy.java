package ai.quickapp.fieldforce;

/** Separate Android's background-start exemption from location access. */
final class TrackingRestartPolicy {
    private TrackingRestartPolicy() {}

    static boolean canStart(boolean dayOpen, boolean foregroundLocation, int sdk,
                            boolean appVisible, boolean backgroundLocation,
                            boolean batteryExempt, boolean bootOrPackageReplaced) {
        if (!dayOpen || !foregroundLocation) return false;
        if (appVisible) return true;
        if (sdk >= 29 && !backgroundLocation) return false;
        return sdk < 31 || batteryExempt || bootOrPackageReplaced;
    }
}