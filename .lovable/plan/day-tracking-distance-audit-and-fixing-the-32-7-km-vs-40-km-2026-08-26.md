# Day Tracking distance audit — and fixing the 32.7 km vs 40+ km gap

## What the audit found (verified against today's data)

For Nagananda Beegamudre, today, the database holds **46 GPS points across a 9.5-hour day**. Suyog, on the same Android app build, has **776 points** for the same day. Both devices report as `android-native`.

The gaps between Nagananda's points tell the story:

```text
00:51 -> 04:23   3h 31m gap
04:27 -> 05:38   1h 11m gap
06:54 -> 09:13   2h 19m gap
09:15 -> 10:01      46m gap
```

Between the gaps, points arrive in short bursts roughly 60 seconds apart — the signature of the app being open in the foreground. So on this device the **background location watcher is not delivering points while the phone is locked or the app is backgrounded**. The travel that happened during those four gaps was never recorded, so no distance engine — Google's or ours — can price it.

This is the dominant cause of the shortfall. The Routes API is behaving correctly; it is being fed a track with multi-hour holes in it.

Two secondary contributors, both in our own code:

- Points closer than **150 m** to the previous one are collapsed before routing, and their straight-line distance (not road distance) is added back. On congested urban stretches this systematically shaves distance.
- The shared filter rejects any fix with accuracy worse than 100 m and any move smaller than the combined accuracy radius (floor 20 m). Genuine slow city movement gets discarded along with jitter.

## Routes API vs Google Maps Timeline — why they differ by design


| &nbsp;                          | Routes API (what we use now)                                    | Roads API "snap to roads"                                       | Maps Timeline                                    |
| ------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Question it answers             | "What is the best road path from A to B via these stops?"       | "Which road segments did this breadcrumb trail actually cover?" | "Where did this phone physically go?"            |
| Input                           | Sparse waypoints (max 25 intermediates per call)                | Dense raw breadcrumbs, 100+ per call                            | Continuous OS sensor fusion                      |
| Gaps                            | Bridged with the *optimal* route — usually shorter than reality | Bridged only if `interpolate=true`, along real roads            | Filled by dead reckoning from accelerometer/gyro |
| Detours, U-turns, parking loops | Lost unless a waypoint happens to sit on them                   | Preserved when breadcrumbs are dense                            | Fully preserved                                  |


Timeline will always read higher. Our target is not to match it exactly, but to close the gap from ~20% down to a few percent.

## The fix

### 1. Capture — make pings actually arrive (the real fix)

- Enable background Watcher and Increase capture rate: OS distance filter from 10 m to 5 m, heartbeat from 30 s to 15 s.
- Detect the failure that hit this user: if no point has been written for more than 5 minutes while the day is open, re-register the background watcher.
- Add a diagnostics surface so this is visible rather than invisible: on the Day Tracking page, show points captured today, longest gap, and a clear warning banner when a gap over 15 minutes exists, with guidance to grant "Allow all the time" location and exclude the app from battery optimisation.
- Verify the Android manifest declares background location and a foreground service type of `location`, and that the app asks for the always-on upgrade after the initial grant.

On the 5-second request: 5 s polling on Android is what triggers Doze to kill the process, and it produces ~17,000 rows per user per day, most of them stationary noise that inflates distance. The recommended configuration is a 5 m displacement filter with a 15 s safety heartbeat — during actual driving this yields a point every few seconds, while a parked phone stays quiet. If you want literal 5 s regardless, say so and it will be set, with the battery and volume trade-off accepted.

### 2. Distance — switch to the Roads API for the traveled path

- New edge function `snap-roads` calling `roads.googleapis.com/v1/snapToRoads` with `interpolate=true`, 100 points per request, overlapping one point between batches so the seams keep their distance.
- Distance is then measured along the returned road geometry, not between our waypoints.
- Where a gap exceeds 3 minutes or 500 m, fall back to a Routes API `DRIVE` leg to bridge it along real roads instead of a straight line — this recovers part of what the tracking gaps lost.
- Remove the 150 m decimation, and relax the capture filters (accept accuracy up to 150 m, movement floor 10 m) so dense breadcrumbs reach the snapper.
- Keep the existing behaviour of locking the final distance at check-out.

### 3. Verify

Replay today's tracks for both users through the old and new pipeline and compare, then re-check tomorrow once the denser capture is live.

## Technical notes

- Files: `src/hooks/useGPSTracker.ts`, `src/utils/googleRoute.ts`, `src/utils/gpsDistance.ts`, `src/pages/GPSTracking.tsx`, `android/app/src/main/AndroidManifest.xml`, new `supabase/functions/snap-roads/index.ts`.
- Roads API must be enabled on the same server key already used for Routes; if it is not, snapping returns 403 and the code falls back to the current Routes path.
- Higher ping frequency increases `gps_tracking` row volume roughly 4x; the table is date-partitioned by query and indexed on `(user_id, date)`, so read cost is unchanged.