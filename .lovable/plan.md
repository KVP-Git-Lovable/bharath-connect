# 2 Sep GPS gaps — what the data shows and how to fix it

## What actually happened (from the stored points)

**Prajwal C (2 Sep)** — checked in 11:21 IST, but the database has only **11 points**, all between 15:51 and 16:57 IST, all within ~1 km of the office. There is nothing before 15:51 and nothing after 16:57. His device heartbeat (battery/network report) also stops at 18:09 IST. So the app was not capturing for most of the day, and after 16:57 the app stopped reporting anything at all — not just location.

**Suyog H (2 Sep)** — 58 points between 16:59 and 23:59 IST, all inside the Kottara/Kadri area. The trail is not continuous; it is three short bursts separated by long silences:

```text
17:00 - 17:38   dense points (app open)
17:38 - 19:19   SILENCE (1h 41m)
19:19 - 19:52   points (app open)
19:52 - 21:24   SILENCE (1h 32m)
21:24 - 21:25   two points
21:25 - 23:27   SILENCE (2h)
23:27 - 23:59   points, then check-out
```

The Sasihitlu trip falls entirely inside one of those silences. Between 17:38 and 19:19 the phone recorded exactly nothing — not even a bad fix.

**Conclusion:** this is not a distance-calculation problem and not an accuracy problem. Points are only being captured while the app is actually in the foreground. As soon as the phone is pocketed/screen-locked, the capture stops completely and only resumes when the app is opened again. Both users' travel happened during those dead windows, which is why Adyar and Sasihitlu never appear.

Secondary detail visible in Suyog's data: while the app is open, roughly half the fixes come in on a fixed 2-minute cadence with 90–130 m accuracy (network/fused guesses). Those are the recovery probes firing, which confirms the real background watcher had already gone silent even while the app was open.

## Why the background watcher is dying (most likely causes, in order)

1. **The Android foreground-location service is being killed by the OEM battery manager.** Once the app process is killed, the plugin's watcher dies with it. Prajwal's device heartbeat freezing at the same time as his last point is the signature of a whole-process kill, not a location problem.
2. **All recovery logic runs on JavaScript timers.** The watchdog that re-registers a dead watcher, and the stationary probe, both live in the WebView. Android freezes WebView timers when the app is backgrounded, so a watcher that dies in the background can never be revived until the user opens the app. That is exactly the pattern in Suyog's data: silence, then a burst the moment the app is reopened.
3. **Battery-optimisation exemption and OEM autostart were probably never actually granted on these two handsets.** Location permission being "Precise" is not enough; without the exemption Android is free to kill the service.

Points sitting unsent in the local queue is ruled out — nothing arrived late for either user.

## Working plan

### Step 1 — Prove it on the device (no guessing)
Add a small, always-on tracker health record written to the backend (a `gps_tracker_events` table): watcher registered, watcher error, watcher re-registered, watcher silence detected, probe discarded, plus a startup record of location permission, background-location permission and battery-optimisation-exemption state. This gives a remote answer for any future "why is there a gap" question instead of needing the phone.

### Step 2 — Stop depending on JS timers for survival
- Re-register the watcher immediately on every app resume and on every `visibilitychange` back to visible, before anything else runs, so a dead watcher is fixed the instant the user touches the phone.
- Keep the foreground service notification permanently visible while the day is open, and re-assert it on resume.
- Treat "no watcher callback since the app was last visible" as a failure and force a fresh watcher rather than only probing.

### Step 3 — Make the OS keep us alive
- On check-in, hard-gate on the three prerequisites: precise location, "Allow all the time" background location, and battery-optimisation exemption. If any is missing, show a blocking prompt that deep-links to the correct settings screen instead of silently continuing.
- Add the OEM autostart/protected-app deep link for Xiaomi/Realme/Oppo/Vivo/Samsung handsets, shown once per device.
- Surface tracker state on the attendance screen ("Tracking active — last fix 2 min ago") so a user can see it has died.

### Step 4 — Don't lose accuracy of the timeline
Stamp each point with the fix's own time from the OS rather than the moment JavaScript handled it, so batched deliveries after a wake-up land at their true times.

### Step 5 — Verify
Run one full workday with both handsets after the changes and compare: continuous trail while backgrounded, health records showing an alive watcher, and a distance that matches the real trip.

## Technical notes
- Files involved: `src/hooks/useGPSTracker.ts` (watcher lifecycle, watchdog, resume handling), `src/utils/gpsCaptureGate.ts` (config), `src/utils/nativePermissions.ts` (permission and battery-optimisation gating, OEM autostart intents), `src/services/gpsSyncQueue.ts` (health event upload), plus a new migration for `gps_tracker_events` with RLS and grants.
- No change to the distance engine (`gpsDistance.ts`), the attendance gate, snapping, or the Day Tracking UI layout.
- Steps 1–2 are code-only. Step 3 requires a new APK build to take effect on the two devices.
