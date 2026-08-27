# Real road distance for GPS tracking

Today the "Traveled: X km" figure on /gps-tracking is a straight-line (Haversine) sum over the filtered GPS points, so it under-reports what a salesman actually drove. The map trail is already snapped to roads through the existing `snap-gps-route` backend function (Google Routes API), and that function already returns the road distance in metres — it is simply thrown away today.

## What changes

- The Day Tracking distance badge and the "Distance" stat card show the actual road distance returned by Google for the snapped route.
- If routing is unavailable (no connector, API denied, or too few points), the display falls back to the current straight-line estimate, so the screen never goes blank or shows 0.
- A small "road distance" vs "estimated" indication so it is clear which number is being shown.

## Technical details

- `src/utils/googleRoute.ts`: change `getSnappedRoute` to return `{ path, distanceMeters, snapped }` instead of only the path. It already chunks the sampled points into ≤27-point calls; sum `distanceMeters` from each chunk response. On failure, return the raw path with `snapped: false` and `distanceMeters: null`.
- `src/pages/GPSTracking.tsx`: hold the snapped-route result in state (computed in the same effect that loads GPS points), and use `routeDistanceKm ?? haversineTotal` for both the stat card and the map badge. Keep the existing Haversine computation as the fallback.
- `src/components/GoogleTrackMap.tsx`: accepts the already-computed path/route result rather than calling the snap util itself, so one routing call serves both the map and the distance (no duplicate Google usage).
- No backend change needed — `supabase/functions/snap-gps-route/index.ts` already requests and returns `routes.distanceMeters`.
- No changes to GPS filtering thresholds, other pages, or the Attendance `TodayGPSRoute` widget unless you want it applied there too.

## Note

Distance Matrix API is deprecated in this connector; Routes API (already wired) provides the same road distance and additionally gives the snapped polyline used to draw the trail, so this uses Routes instead.
