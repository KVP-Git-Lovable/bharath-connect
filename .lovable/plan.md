# Why location capture and Day Tracking stopped after Phase 1 / 1.5

## What the data shows (verified in the database)

Your user, 1–2 Sep:

- Sep 1: 195 points. Up to ~03:00–04:00 UTC (09:00–09:30 IST) accuracy values vary realistically (20 m, 25 m, 56 m, with speed values). From ~04:00 UTC onward, almost every row has accuracy **exactly 35.00 m** and no speed.
- Sep 1 + Sep 2 combined: **225 of ~240 points have accuracy 35.00** — a single coarse network-provider value.
- Sep 2: 44 points, all inside a ~20 m box around the check-in spot. Only 7 points (17–33 m accuracy, with speed) around 05:49–05:51 UTC look like real GPS — those are the check-in fixes.
- Sep 2 gap: nothing between 05:51 and 09:06 UTC (3h15m), then a burst every 15 s once the app was opened again.
- The second checked-in user today (check-in 05:51 UTC) has **zero** GPS points for the day.
- No attendance row for 31 Aug / 1 Sep / 2 Sep has a check-out time, so the tracker considered the day open all night — which is why hourly points exist at 20:00–04:00.

Read together: the high-accuracy background watcher has effectively stopped delivering. What remains in the table is almost entirely the new **stationary probe**, and that is why the trail is one dot and distance is 0.0 km.

## The causes, in order of confidence

1. **The watchdog can no longer resurrect a dead watcher (Phase 1.5 regression).**
   Re-registration now happens only when the probe *fails* AND silence exceeds 5 minutes. The probe is a low-power network fix, which almost always succeeds — so a watcher killed by Android is never detected and never re-registered. Before Phase 1.5, prolonged silence alone triggered a re-register.

2. **The probe uses low accuracy, and its fixes have become the whole trail.**
   `getCurrentPosition({ enableHighAccuracy: false })` returns the coarse fused/network fix — exactly the 35 m rows filling the table. They carry no speed and don't reflect real motion.

3. **Those coarse fixes then suppress distance twice over.**
   - Capture gate: required movement = sum of both fixes' accuracy = 35 + 35 = **70 m**, so nothing anchors.
   - Display engine: stationary radius = max(30, 1.5 x 35) = **52 m**, so the whole day collapses into one stationary cluster → 0.0 km.

4. **No timer-based acquisition survives backgrounding.**
   Phase 1 removed the forced 15 s fix, so once the WebView is suspended/Dozed, the JS watchdog stops ticking too. That is the 3h15m hole today, and the reason overnight points appear roughly hourly rather than every 2 minutes.

5. **Contributing:** never checking out keeps the day open indefinitely, so this coarse trail also accumulates overnight.

## Proposed fix (Phase 1.6) — restore capture, keep the battery gains

1. **Health test independent of the probe.** Treat prolonged watcher silence (> 5 min) as a dead watcher and re-register it, whether or not the probe succeeded — restore the pre-1.5 behaviour, while keeping the probe for trail density.
2. **Make the probe high accuracy.** Use `enableHighAccuracy: true` for the stationary probe so trail-density samples are real GPS fixes (~10–20 m), not 35 m network guesses. One fix every 2 minutes of silence has negligible battery cost compared with the old 15 s polling.
3. **Cap probe-quality damage.** Reject probe fixes worse than a sane accuracy bound (e.g. > 50 m) instead of writing them, so a coarse fix can never become the anchor and inflate the movement threshold to 70 m.
4. **Verify the watcher is actually registering on device.** Add explicit debug logging of watcher registration, first callback, silence duration, and each re-register, so the next workday's logs prove whether the plugin watcher is alive — this is the one thing the database alone cannot tell us. This also covers the case where the patched plugin isn't in the installed APK (the second user's zero points suggests the watcher may not be starting at all on some installs).
5. **Native-side keepalive check.** Confirm the foreground service and battery-optimisation exemption are still being requested at startup; if Android is killing the service, re-registration from JS alone won't help while the app is suspended.

No changes to distance maths, snapping, Day Tracking UI, or the attendance gate.

## Technical notes

Files to change: `src/hooks/useGPSTracker.ts` (watchdog health logic, probe accuracy, probe-quality gate, diagnostics), `src/utils/gpsCaptureGate.ts` (probe accuracy ceiling constant only). Verification: one workday on device, comparing point count, accuracy distribution (should no longer be dominated by 35.00) and trail continuity against 31 Aug.
