# Fix: Google Map blank on /gps-tracking

## What's actually wrong

The map code is fine — Google is rejecting the request. The browser console on this page shows:

```text
Google Maps JavaScript API error: RefererNotAllowedMapError
Your site URL to be authorized:
https://eb4a3a70-d305-4716-9d58-00f25660967c.lovableproject.com/gps-tracking
```

This project is linked to the connection "Google Maps - Sales Tracking", which is your own Google Cloud API key (not the Lovable-managed key). That key has an HTTP-referrer allowlist in Google Cloud, and it currently allows the Staging-Quick locate project's domains but not this project's domains. So the same key works there and is blocked here — the map container renders, then Google refuses to draw tiles, leaving the blank panel on Day Tracking.

## Fix (done by you in Google Cloud, ~2 minutes)

1. Open Google Cloud Console > APIs & Services > Credentials, and open the API key used for the "Google Maps - Sales Tracking" connection.
2. Under Application restrictions > Website restrictions, add these referrer patterns:
   - `https://*.lovableproject.com/*`
   - `https://*.lovable.app/*`
   - `https://locate.quickapp.ai/*` (published custom domain, if not already there)
   - `https://*.quickapp.ai/*`
3. Under API restrictions, confirm **Maps JavaScript API** and **Routes API** are both allowed (Routes is used for snapping the trail to roads).
4. Save, wait ~1-2 minutes for propagation, then hard-refresh `/gps-tracking`.

No code change is required for this part, and nothing outside the map is touched.

## Small cleanup I'll do in code

- Wrap `GoogleTrackMap` in `React.forwardRef` (or drop the ref passed to it) to clear the console warning "Function components cannot be given refs" coming from `GPSTracking`.
- Show a clear in-map message when Google returns a referrer/authorization error, instead of a blank grey panel — so this failure mode is self-explanatory next time.

## Alternative if you'd rather not touch Google Cloud

I can link the Lovable-managed Google Maps connection instead, which works out of the box on `*.lovableproject.com` and `*.lovable.app` previews — but it will not work on the published `locate.quickapp.ai` custom domain. Your own key with the referrers above covers both, so it is the better option.
