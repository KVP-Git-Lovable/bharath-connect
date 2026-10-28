# GPS tracking reliability fixes (staging first, then port to SBEE cables)

Fixes only. No change to accuracy filters, jump/speed guards, stationary clustering, face verification, Day Tracking map, activity travel calculations, or payroll logic.

## What the plugin already provides (checked in its native source)
- A foreground service using Google's fused location (high accuracy), declared as a location-type foreground service.
- It does **not** override `onStartCommand`, and it is started by binding from the app. A service that is only bound is not restarted by Android after it's killed, so the default "sticky" behaviour does not help us.
- No on-device storage of points: every fix goes straight to the web layer. If the web layer is frozen or dead, points are lost.
- No restart after reboot, no watchdog.
- The existing patch file mostly contains compiled build leftovers; it will be regenerated cleanly with only source changes.

## Problem 1: tracking stops and doesn't come back

| # | Fix | Type |
|---|-----|------|
| 1.1 | Patch the plugin service: add `onStartCommand` returning `START_STICKY`, start it as a started service (not only bound), and add `onTaskRemoved` so swiping the app away keeps it going while a day is open | Native, new APK |
| 1.2 | Patch the plugin to save every fix to a small on-device database first, then hand it to the app; the app confirms receipt, and anything not confirmed is replayed on the next start | Native, new APK (+ small app-side part) |
| 1.3 | Boot receiver + `RECEIVE_BOOT_COMPLETED`: after reboot, if the saved "day open" flag is set (written at check-in, cleared at check-out), restart the location service | Native, new APK |
| 1.4 | Periodic background job (every 15 min, Android's minimum): if a day is open and the service is dead or no fix in 10+ min, restart it | Native, new APK |
| 1.5 | `startNativeBackground` no longer gives up once: retry loop (30s, 1m, 2m, then every 5m) while a day is open, and show a banner when stuck on foreground-only | App update, ships immediately |
| 1.6 | One ordered permission flow (location, then background location, then notifications, then battery exemption, then autostart guidance), run once and remembered; camera/microphone stay asked only when used. Replaces the ~7 scattered calls | App update, ships immediately |
| 1.7 | Tracking health card: confirm it shows on Attendance during an open day (also add it to the Day Tracking screen); after "Fix settings"/"Autostart" return, automatically re-start tracking | App update, ships immediately |
| 1.8 | Phone-brand-specific autostart guide: read manufacturer, show step-by-step text for Xiaomi/Redmi/POCO, Oppo/Realme/OnePlus, Vivo/iQOO, Samsung, with direct links to the right settings screen (based on the "Don't kill my app" list), falling back to general battery settings | Brand detection + direct links: native, new APK. Guide screens: app update |

## Problem 2: distance not fully captured

| # | Fix | Type |
|---|-----|------|
| 2.1 | `computeSnappedDistanceKm`: when road matching fails completely, keep the gap-leg estimate in the total instead of 0 (same as the per-batch fallback already does) | App update |
| 2.2 | Check-out: retry sending queued points for up to ~10 seconds before locking distance; if more points arrive later for that day, recompute once and update the stored total (recorded as a correction) | App update |
| 2.3 | Upload queue: on permission/auth errors, refresh the session and retry with backoff; only set aside (not delete) points after repeated real rejections, and flag them to the user | App update |
| 2.4 | Local queue: save immediately on each point instead of every 3 s; when the cap is reached, show a visible warning instead of silently dropping. Long-term storage moves to the native on-device store from 1.2 | App update now; full durability needs the new APK |

## Safety and testing
- Existing regression tests for capture gate, queue and distance must still pass; new tests for 2.1, 2.2, 2.3 and the queue overflow warning.
- Before/after comparison on recorded days: Day Tracking distance, check-in/out and activity travel distance must be unchanged when no points are missing.
- Device tests you'll need to run with the new APK (I can't do them from here): screen-locked drive, app swiped away mid-drive, reboot mid-shift, Xiaomi or Oppo/Vivo autostart and watchdog recovery. Road-matching failure and auth errors I can simulate in tests.
- I'll show the full diff for every changed file and mark each as "app update" or "new APK".

## Release order
1. App-only fixes (1.5–1.7, 2.1–2.4) go live right away, with no APK needed.
2. Native fixes (1.1–1.4, 1.8 links) need a new APK build and install.
3. After staging is checked, port the same changes to SBEE cables.

## Technical details
- Plugin patch via patch-package (`patches/@capacitor-community+background-geolocation+1.2.26.patch`), regenerated with only `src/main` Java/manifest changes; build outputs excluded.
- New app-side native classes in `android/app/src/main/java/ai/quickapp/fieldforce/`: `BootReceiver`, `TrackingWatchdogWorker` (needs the `androidx.work:work-runtime` dependency), with brand detection added to `DeviceSettingsPlugin`.
- Shared native "day open" flag in SharedPreferences, set and cleared through a plugin method called from `useAttendance` check-in/check-out.
- Files touched (app): `useGPSTracker.ts`, `gpsSyncQueue.ts`, `gpsDistance.ts`, `useAttendance.ts`, `nativePermissions.ts`, `useNativeStartup.ts`, `__root.tsx`, `TrackingHealthCard.tsx`, plus a new autostart guide component.
