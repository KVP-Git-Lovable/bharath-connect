# Fix: Day Tracking shows only pins — no route, distance, points or activity info

## What's happening

Day Tracking only keeps GPS points that fall inside an "active check-in window" read from the `activity_sessions` table. Verified in the database:

- Nagananda has GPS data for Aug 24–27 (57 / 26 / 54 / 51 points per day).
- `activity_sessions` is **completely empty** — 0 rows for the whole project, not just this user.
- His actual check-in/check-out times live in the `attendance` table (e.g. Aug 27 check-in 02:34 UTC, still open).

So every GPS point is discarded by the session gate. With zero points the map draws no route, the distance reads 0.0 km, and the Distance / Points / Activity summary card (which only renders when points exist) disappears. The blue pins still show because they come from `activity_events`, which is not session-filtered.

## The fix

Change the check-in gate in the Day Tracking data fetch to read from `attendance` (the table the app actually writes on check-in/check-out) instead of the unused `activity_sessions` table:

- Query `attendance` rows for the selected user across the chosen date range, using `check_in_time` and `check_out_time` as the window (open window when there is no check-out, same as today).
- Keep the rest of the pipeline unchanged: the same window test, then the existing `filterTrackPoints` cleanup, road-snapping via the `snap-roads` edge function, and the distance display.
- Safety fallback: if a date in range has GPS points but no attendance row at all, keep that day's points rather than silently dropping them, so tracking never goes blank again for a missing check-in record.

No changes to Google Maps logic, snapping, or distance maths — only the source of the check-in window.

## Technical notes

- File: `src/pages/GPSTracking.tsx`, inside `fetchTrackingData` (the `activity_sessions` query and `isInActiveSession` helper).
- After the change, distance for these days will be computed from the road-snapped path as designed.
