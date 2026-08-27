# Fix: inflated road distance on GPS Tracking (90.6 km for a local track)

## Diagnosis (verified against real data)

- The Google Routes API itself is **working correctly** — a live test of `snap-gps-route` returned a valid snapped polyline and distance.
- For the screenshot case (Suyog, Aug 25, Mangaluru): 507 raw GPS points, ~1 point/minute, accuracy ~35 m. The track is a small local area (~1.4 km max span), and the straight-line sum over the filtered track is **~46.7 km** — already inflated by stationary jitter (1-min GPS drift of 20–50 m passes the 20 m filter).
- The Routes API then turns that into **90.6 km**: every short jitter hop is sent as a waypoint, and Google snaps each hop onto the real road network — routing out to the nearest road and back for each tiny leg, roughly doubling the distance. So the API is "proper", but feeding it jitter waypoints produces an inflated number.

## What changes

1. **Don't route micro-legs through the Roads API**
   - In `getSnappedRoute`, before calling the Routes API, collapse consecutive points that are closer than a minimum leg distance (~150 m): short hops keep their straight-line distance, only genuine movements (≥150 m) become routing waypoints.
   - This removes the "snap out to the road and back" inflation for stationary drift while keeping real road distance for actual trips.

2. **Tighten the stationary-jitter filter**
   - Raise the effective minimum movement threshold used for route building (the current 20 m is below the 35 m accuracy of this device's fixes), so standing-still drift never reaches the route builder. Keep the existing shared `filterTrackPoints` for display; apply the stronger threshold only when building route waypoints.

3. **Keep the honest fallback + labeling**
   - Distance card / map badge continues to show "road distance" when routing succeeded, "estimated" when it fell back to straight-line, and the route polyline on the map stays road-snapped for real movement.

4. **Verify with the same real track**
   - Re-run the Aug 25 track through the new logic and confirm the displayed distance lands near the true traveled distance (small local loop), not 90.6 km.

## Technical details

- `src/utils/googleRoute.ts`: add waypoint decimation — walk the sampled points, only emit a waypoint when accumulated distance from the last emitted waypoint exceeds ~150 m; add the skipped straight-line meters back into the total so no distance is lost.
- `src/pages/GPSTracking.tsx`: no logic change needed beyond consuming the corrected `distanceMeters`; labels already exist.
- No backend change — `snap-gps-route` stays as-is.
- No changes to GPS capture, session gating, or other pages.
