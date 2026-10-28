# Project rules

- Native changes to `@capacitor-community/background-geolocation` go only through `patches/@capacitor-community+background-geolocation+1.2.26.patch`, and the patch holds `android/src/main` source only, never `android/build` outputs — compiled leftovers bloat it and break re-applying.
- The location service reads a native "day open" flag (SharedPreferences `gps_native_health`, set via `DeviceSettings.setTrackingDayOpen` from `useGPSTracker`); boot receiver, watchdog worker and sticky/headless restart all key off it — keep one source of truth for "should we be tracking".
- Captured GPS points are never deleted on upload failure: transient auth errors retry after a session refresh, repeated rejections and queue overflow move points to on-device side stores and raise `GPS_QUEUE_WARNING_EVENT` — silent drops make distances short with no trace.
