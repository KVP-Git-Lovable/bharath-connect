# Android tracking reliability fixes — 5 November 2026

## Release boundary

All functional changes in this update are native Android changes and require a new APK. Publishing the hosted bundle alone does not activate them. No JS/TS, database, UI, face verification, distance thresholds, attendance/payroll or activity calculations were changed.

## Changes

- Plugin patch: promote through the typed foreground helper before watcher acquisition; surface promotion rejection; retain started-service status during bridge destruction; keep headless capture during watcher replacement; guard stale asynchronous registration callbacks; retry failed headless registrations; restart stale fused subscriptions; journal every delivered batch fix; stop native persistence when the existing day-open flag closes/expires.
- Plugin journal: remove the silent size-cap drop; report durable-write failure without claiming successful persistence; replay immutable inflight batches without merging/deleting the live journal.
- TrackingRestarter and TrackingRestartPolicy: check location permission and Android background-start eligibility separately, persist refusal/deferred state, request explicit stale recovery.
- MainActivity: retry an open day's native service when the Activity is visible.
- DeviceSettingsPlugin: establish started-service status after committing the existing day-open flag, closing the watcher/day-flag ordering race.
- TrackingWatchdogWorker: worker execution no longer impersonates a location-service heartbeat; stop an expired native day.

## RCA correction

Android's two-argument startForeground call can infer the type declared in the manifest. Its use alone does not prove MissingForegroundServiceTypeException. The prior claim was incorrect. Verified lifecycle defects—not that overload alone—motivated this patch. Device logs from the replacement APK are still needed to establish whether these changes resolve Suyog's specific failure.

## Checks completed

- Revised source-only patch applies cleanly to the original 1.2.26 package.
- Lifecycle checks reproduce the old promotion ordering and unconditional bridge shutdown, then pass against the patched source.
- 10 Java/JUnit restart-policy tests pass under Java 21.
- 70 existing GPS capture, queue, distance, benchmark, checkout-relock and activity travel tests pass.
- Independent reviews identified additional async and persistence defects; corrections are included.
- Preview build telemetry reports build OK.

## Not verified / release gate

Android Gradle compilation was attempted but stopped during configuration because android/capacitor-cordova-android-plugins/cordova.variables.gradle is missing. This environment also has no Android SDK or connected device. No APK was produced, and full Android compilation is not confirmed.

In the Android build environment, install dependencies (postinstall applies the patch), run the existing sync:android command, then compile and run native unit tests. Release a replacement APK only after screen-locked drive, Recents swipe, reboot mid-shift, checkout, and Xiaomi/HyperOS tests confirm fixes captured natively are drained and read back in Day Tracking. Existing snap-failure and auth-error regression tests pass but do not replace device/network fault testing.

Permission/device requirements remain: background restarts need both background location access and a permitted background-start basis. A visible Activity can start with while-using location permission. No exact alarms or bypasses were added. Android force-stop and OEM restrictions can still block recovery; watchdog timing is not guaranteed.