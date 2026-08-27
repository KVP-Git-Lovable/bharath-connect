# GPS Tracking & Dashboard Cache — Critical Fixes

## Root causes found

**Problem 1 — tracking runs without check-in:**
`src/main.tsx` (line 86) calls `startBackgroundTracking()` from the legacy `src/services/backgroundTracking.ts` on every app load. That service starts a 60-second location-capture interval unconditionally — no check-in gate at all. On top of that, there are **three separate trackers** writing to `gps_tracking` with different rules:
- `backgroundTracking.ts` — no gate, no filtering (legacy, auto-started)
- `useGPSTracker.ts` (AppLayout) — gated on attendance day open, accuracy ≤ 300m
- `capacitorBackgroundTracking.ts` — started on activity check-in, saves every 5s/2m point unfiltered

**Problem 2 & 3 — fluctuating / inconsistent distance:**
The two distance displays use **different algorithms**:
- `GPSTracking.tsx` (Day Tracking tab): aggressive filtering (accuracy ≤ 50m, skip < 20m jitter, speed ≤ 35 km/h) + Google road-snapping
- `TodayGPSRoute.tsx` (dashboard card, shown in the APK screenshot): raw Haversine over points with accuracy ≤ 100m, **no jitter filter at all**

So the same journey yields different numbers, and as new unfiltered points arrive the dashboard number keeps moving. Nothing is "locked" at check-out.

**Problem 4 — dashboard cache:**
`useDashboard.ts` seeds the summary from `localStorage["dashboard_cache_v1"]` as `placeholderData`. That cache has no date/user validation, so stale KPIs render on every load until the RPC refetch completes — and in the APK the stale values can persist visibly.

## Fix plan

### 1. Single tracker, gated on check-in
- Remove the `startBackgroundTracking()` auto-start from `main.tsx` and stop using the legacy `backgroundTracking.ts` service (delete its auto-run path).
- Make `useGPSTracker` the **only** tracker. It already gates on attendance check-in/check-out — keep that: tracking starts on "Start My Day" and stops on check-out. Before check-in, zero points are written (test case: GPS shows 0 km).
- Remove the duplicate `startCapacitorBackgroundTracking` / `stopCapacitorBackgroundTracking` calls from `CreativeActivityForm.tsx` (activity check-in no longer spawns a second tracker); `capacitorBackgroundTracking.ts` is retired.
- Tighten capture filtering in `useGPSTracker`: reject accuracy > 100m (currently 300m), keep the 30m minimum-move rule.

### 2. One shared distance algorithm
- Create `src/utils/gpsDistance.ts` with a single `filterTrackPoints()` + `computeDistanceKm()` implementation (accuracy ≤ 100m, skip < 20m stationary jitter, reject impossible speeds, split on > 5min gaps).
- Use it in **both** `GPSTracking.tsx` (before road-snapping) and `TodayGPSRoute.tsx`, so web and APK show identical numbers for the same data.

### 3. Lock the distance at check-out
- Add a `total_distance_km` column to `attendance` (migration with GRANT; column only, no new table).
- On check-out, compute the final distance once with the shared algorithm and store it on the attendance row.
- `TodayGPSRoute` displays the stored value when the day is closed (never recalculates → no fluctuation); while the day is active it shows the live computed value.

### 4. Dashboard cache fix
- Key the dashboard cache by user + date (`dashboard_cache_v2_<userId>_<date>`); ignore and delete entries that don't match today/the current user.
- Clear the cache entry on app start when the date has rolled over, so a hard refresh / APK relaunch never shows yesterday's numbers.

## Files touched
- `src/main.tsx` — remove legacy auto-start
- `src/services/backgroundTracking.ts` — remove/neuter auto-run (legacy)
- `src/services/capacitorBackgroundTracking.ts` — retired
- `src/components/activities/CreativeActivityForm.tsx` — drop duplicate tracker start/stop
- `src/hooks/useGPSTracker.ts` — tighter accuracy filter (sole tracker)
- `src/utils/gpsDistance.ts` — new shared algorithm
- `src/pages/GPSTracking.tsx`, `src/components/TodayGPSRoute.tsx` — use shared algorithm + locked distance
- `src/hooks/useDashboard.ts` — date/user-scoped cache
- Supabase migration — `attendance.total_distance_km` column
- Check-out flow (attendance hook) — persist final distance

## Verification (test case)
1. Fresh load, not checked in → GPS Track shows 0 km, no points written.
2. Check in ("Start My Day") → tracking starts, distance grows only with real movement.
3. Check out → distance locks; reopening the app/APK shows the same locked value.
4. Web Day Tracking and APK dashboard show the same number for the same journey.
5. Dashboard KPIs refresh correctly after relaunch (no stale cached values).
