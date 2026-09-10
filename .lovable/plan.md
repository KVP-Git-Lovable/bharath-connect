# Activities Effort: real travelled distance, travel time, meeting time

## What already exists (verified)

- Day check-in stores its timestamp and GPS point on the attendance record.
- GPS points recorded through the day are already stored per user with time, accuracy and speed — the same data the Day Tracking map and distance use.
- Activity check-in is the status change to In Progress, check-out is the change to Completed; both stamp their times and the GPS point of the moment.
- The activity record already has places to store distance, travel minutes and which record the journey started from — no new storage needed.
- Today the distance is measured as a point-to-point road distance between two locations, not along the route actually driven. That is the gap this change closes.

## What changes

1. **Distance travelled becomes the real route.** On activity check-in, the app sums the distance along the GPS points recorded between the journey start and the check-in moment, using the app's existing trajectory engine (the same one behind Day Tracking) so both screens agree. Invalid points, duplicates, stationary drift and impossible jumps are already discarded by that engine.
2. **Where the journey starts.** For the first activity of the day it is the day check-in. For later activities it is the previous activity's check-out. Only the logged-in user's own points, for that date, between those two moments are used.
3. **Fallback.** If there are too few usable GPS points in that window, the current point-to-point road distance is used instead, so a value is always shown.
4. **Travel time** stays the elapsed time from the journey start to the activity check-in, and is frozen at check-in — it never keeps growing afterwards.
5. **Meeting time** is check-out time minus check-in time, shown only once the activity is checked out. Activities completed without ever being checked in show a dash rather than "0 min".
6. Both the card Check-in button and the Check-in inside the Edit Activity window use the same calculation.

## Not touched

Attendance, GPS tracking behaviour, the background tracker, activity creation and editing, Travel Expense, permissions, all page layouts and the Edit Activity design. No database tables, columns, policies or data are created, renamed or removed.

## Technical notes

- New helper in `src/utils/activityTravel.ts`: load `gps_tracking` rows for `user_id` + `date` with `timestamp` between origin time and check-in time, map to `TrackPoint`, run `computeFilteredDistanceKm` / `processTrajectory` from `src/utils/gpsDistance.ts`. Require a minimum of ~3 accepted points and a non-zero result, else fall back to the existing `roadDistanceKm`.
- `computeTravelForCheckIn` keeps its current origin resolution (previous checked-out activity → attendance check-in) and its current return shape; only the distance source changes.
- `ActivityEffortSection.tsx`: guard the meeting-time fallback so a completed activity with no in-progress history renders "—" instead of 0 min.
- Callers in `src/pages/Activities.tsx` and `src/components/activities/CreativeActivityForm.tsx` stay as they are.

## Verification

- Day check-in, drive, check in an activity: distance matches the Day Tracking route for that window; travel time equals the gap between the two timestamps.
- Check out: meeting time appears; before check-out it stays blank.
- Second activity: measured from the first activity's check-out.
- No GPS trail: falls back to road distance, never 0 km.
- Typecheck, tests and build clean.
