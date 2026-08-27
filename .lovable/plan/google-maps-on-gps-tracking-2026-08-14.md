# Google Maps on GPS Tracking

Bring the same Google Maps setup used in the Staging-Quick locate project into this project's `/gps-tracking` page, replacing the current OpenStreetMap/Leaflet map there.

## Steps

1. **Connect Google Maps Platform** — open the connector card so you can pick the same connection used in the other project. This injects the browser key and the gateway credentials into this project.
2. **New map component** (`src/components/GoogleTrackMap.tsx`) that loads the Maps JavaScript API asynchronously with the browser key and renders:
   - the GPS trail as a polyline (blue, rounded joins)
   - a pulsing "latest location" marker
   - a start marker for the day's first point
   - activity/stop markers with info windows
   - auto-fit bounds over all points, same behaviour as today
3. **Swap it into `/gps-tracking`** — `src/pages/GPSTracking.tsx` uses the new component in both map slots (Current Location tab and the trail/history map). Loading and empty states stay as they are.
4. **Snap the trail to roads** — replace the current OSRM routing helper with Google Routes API called through the connector gateway from a small edge function, so the drawn path follows actual roads. Straight-line fallback stays if routing fails.

Leaflet stays installed and untouched for any other place it is used; only the GPS Tracking page switches to Google Maps.

## Technical notes

- Browser key: `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`, loaded with `loading=async` + a global `callback`, plus the tracking-ID channel param. Standard `google.maps.Marker` (no `mapId`, no AdvancedMarkerElement).
- Routing edge function posts to `https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes` with `Authorization: Bearer LOVABLE_API_KEY` and `X-Connection-Api-Key`, batching waypoints (Routes API allows up to 25 intermediates per call) and decoding the returned polyline. 403 responses surface the Google Cloud key-restriction message rather than a generic error.
- The managed key only works on `*.lovable.app` / `*.lovableproject.com`. Since this project also publishes to `locate.quickapp.ai`, the connection used must be one with that custom domain in its HTTP-referrer allowlist — same as the other project.
