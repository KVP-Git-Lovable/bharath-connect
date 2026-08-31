# Day Tracking shows 0.0 km — diagnosis and fix

## What the data shows (verified today, Aug 28)

Nagananda Beegamudre has only **14 raw GPS rows** for today:

```text
02:31 UTC  12.92227, 77.53858   (Bangalore city)
04:36 UTC  12.67432, 77.44189   (~30 km south)   <-- 2h 5m gap
04:42 UTC  same spot
06:45 - 07:12 UTC  10 rows, all within ~2 metres of that same spot
```

So the trail is: one fix, a 2-hour blackout during which the phone moved ~30 km, then a
cluster of stationary fixes. Nothing was recorded *between* the two locations.

The shared filter (`filterTrackPoints`) then:
- keeps the 02:31 fix,
- treats the 04:36 fix as a **new segment** (gap > 5 min), so the 30 km jump adds no distance,
- discards every later fix as stationary jitter (< 10 m move).

Result: 1 usable point, no polyline, and 0.0 km — exactly what the screenshot shows. The
route/distance code is never even called, because road snapping needs at least 2 points.

**This is not a Google API problem.** Roads/Routes are healthy; there is simply no movement
data to snap. The cause is on-device capture: background location pings are not being
delivered while the user travels (Doze / battery optimisation / background location revoked).

## Proposed fix (two parts)

### 1. Stop throwing away travel across tracking blackouts
Today a > 5 min gap silently kills the distance for that leg. Instead, when two consecutive
fixes are far apart in time but plausibly reachable by road, bridge them with the Routes API
(the `snap-gps-route` gap-bridging path that already exists in `src/utils/googleRoute.ts`) and
count that road distance, clearly labelled as *estimated across a tracking gap*.

Changes:
- `src/pages/GPSTracking.tsx`: don't require 2 *filtered* points before routing — pass the
  segmented track (including gap ends) to `getSnappedRoute`.
- `src/utils/gpsDistance.ts`: keep the segment split for the drawn line, but return the gap
  ends so bridging is possible instead of dropping them.
- Show a small note under Distance when any leg was bridged ("includes N km estimated across
  tracking gaps"), so the number is never silently inflated without explanation.
- Guard: bridge only if the gap is under a sane threshold (e.g. straight-line < 200 km and
  average implied speed < 120 km/h), otherwise leave it out.

### 2. Surface *why* the trail is empty
Add a diagnostic line on Day Tracking when the day has large blackouts: "Tracking gap of 2h 5m
detected — background location may be disabled on the device", with a link to the existing
device-settings prompt (battery-optimisation exemption + "Allow all the time" location) already
built in `nativePermissions` / `DeviceSettingsPlugin`.

No changes to the Google Maps gateway, edge functions, or the snapping logic itself.

## Technical notes
- Files touched: `src/pages/GPSTracking.tsx`, `src/utils/gpsDistance.ts`, and a small helper in
  `src/utils/googleRoute.ts` for gap bridging (function already present).
- Historical days keep their stored values; only live/recomputed views change.
- Distance stays consistent across web, dashboard and APK because the shared helpers are the
  ones being changed.
