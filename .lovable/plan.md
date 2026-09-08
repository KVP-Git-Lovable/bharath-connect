# Activities → Effort: Distance, Travel Time, Meeting Time

## What already exists (verified)

- The day check-in (Start My Day) already stores the timestamp and GPS point on the attendance record (`check_in_time`, `check_in_location` with latitude/longitude). Confirmed with today's data.
- Activity check-in is the status change to "In Progress"; check-out is the change to "Completed". Both already stamp `start_time` / `end_time`.
- A travel calculation already exists and does exactly what is asked: it measures from the previous activity's check-out point, or from the day's attendance check-in for the first activity, and saves distance (km) and travel minutes onto the activity.
- The Effort box already reads those saved values and computes Meeting time as check-out minus check-in.

## Why the boxes show "—" today

Two separate causes, both confirmed:

1. When the activity is checked in from the **activity detail popup** (the status pills inside the Edit Activity window), no location is captured and the travel calculation is never run. Only the check-in button on the activity card in the list runs it. Today's two in-progress activities have a check-in location but no travel values.
2. The travel calculation looks up the day check-in of the **activity's owner**. Today the activities belong to Shravan kumar, who has no attendance check-in for 8 Sep, while the only attendance record belongs to another user. With no start point, the correct behaviour is to leave the fields empty — which is what happened.

## Changes to make (small and contained)

1. **Popup check-in behaves like the card check-in.** In the Edit Activity window, changing the status to In Progress will capture the location the same way the card does (same existing location helper, same fields), then run the same existing travel calculation and save distance and travel time onto the activity. Changing to Completed keeps stamping the check-out time, and back-fills the start time from the status history when it is missing, so Meeting time is never wrong.
2. **Meeting time state.** Keep showing "—" while the activity is still in progress (no invented value), and show the elapsed minutes only once it has been checked out. Falls back to the recorded in-progress timestamp for older records that have no start time.
3. **Graceful empty states.** If there is no day check-in, no attendance location, or the location request is refused, distance and travel time stay empty rather than showing 0 km. The "Previous activity considered" line keeps showing what was used.
4. No database change: `travel_distance_km`, `travel_time_mins`, `travel_from_type`, `travel_from_activity_id`, `start_time` and `end_time` already exist on the activity record and are already persisted, so values survive closing and reopening the activity.
5. Travel Expense, all Activities UI, Attendance behaviour, face/GPS policies and every other module stay untouched.

## Technical notes

- Edit `src/components/activities/CreativeActivityForm.tsx` `handleStatusChange` to mirror `src/pages/Activities.tsx` `handleStatusChange`: `getCurrentPosition` → `status_change_lat/lng`, `location_lat/lng`, history entry coords, optional reverse geocode, then `computeTravelForCheckIn` from `src/utils/activityTravel.ts` on the in-progress transition; back-fill `start_time` on completion.
- Minor guard in `src/components/activities/ActivityEffortSection.tsx` for the meeting-time fallback start.
- `computeTravelForCheckIn` already prefers the previous checked-out activity of the same user/day and falls back to attendance; multi-activity chaining is reused as-is.

## Verification

- Check in an activity from the popup and from the card: distance and travel time appear when a day check-in with location exists.
- Check out: Meeting time appears; before check-out it stays "—".
- Reopen the activity: all three values persist.
- No day check-in: fields stay empty, no 0 km.
- Typecheck, tests and build clean.
