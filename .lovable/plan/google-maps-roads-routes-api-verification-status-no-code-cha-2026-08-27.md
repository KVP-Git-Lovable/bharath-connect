# Google Maps Roads/Routes API — verification status (no code changes)

## Status: RESOLVED

User enabled the Roads API (and Routes, Places, Geocoding, etc.) on both Google Maps keys in Google Cloud Console. Verified live on 2026-08-27 via the connector gateway against the linked "Google Maps - Sales Tracking" connection:

- Roads API `snapToRoads` (with `interpolate=true`): HTTP 200, returned fully snapped + interpolated points.
- Routes API `computeRoutes` (DRIVE): HTTP 200, returned distance/duration.

## Actions taken

1. Tested both APIs through the connector gateway — both pass.
2. Resolved the Project monitoring finding "Road-snapping for GPS trails is broken (Google Roads API not enabled on key)" as fixed.

## Notes

- No code changes required. The `snap-roads` edge function already routes through the gateway and falls back to raw GPS + Haversine distance if snapping ever fails, so trip playback no longer 503s.
- Distance for new trips will now use road-snapped paths; historical trips computed while the API was blocked retain their fallback (straight-line) distances unless recomputed.
