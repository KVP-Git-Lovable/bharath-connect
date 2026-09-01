# Review: Phase 1 battery optimisation vs. GPS tracking / Day Tracking

I read the actual code in the project (capture hook, capture config, sync queue, attendance flush, the native plugin patch) and the `gps_tracking` table + its security rules. Verdict below, then the small set of fixes I recommend.

## Verdict on the 9 claims

Verified as accurate and safe:

- **(2) Native config** — `interval 3000 / fastest 2000 / maxWait 8000 / distanceFilter 5 / HIGH_ACCURACY` is really in `GPS_CAPTURE_CONFIG`, and the plugin patch really passes them through. Accuracy priority unchanged, so fix quality is unchanged.
- **(3) Single acquisition source** — on native the watcher is the only acquirer; the remaining `getCurrentPosition` is the web-only fallback. Duplicate watcher start is blocked. This removes the old dual-provider ping-pong, which should *improve* distance accuracy, not hurt it.
- **(4–8) Buffer / retry / duplicates / offline** — queue is synchronous, persisted to localStorage, chunked, single-flight, backoff-capped, client UUID + `ON CONFLICT DO NOTHING`. The `id` column is a real `uuid` PK, so client-generated IDs are valid and de-duplication works.
- **(9) Distance logic untouched** — `gpsDistance.ts`, `googleRoute.ts`, snapping and the checkout lock are unchanged; the only addition is a queue drain before checkout, which makes the locked distance *more* complete, not less.

So: background tracking continues as before, and none of the Day Tracking maths changed.

## Three real risks worth fixing (not blockers, but they can visibly affect Day Tracking)

1. **Stationary gaps in the trail.** Previously a forced fix every 15 s kept the trail dense even when standing still. Now every point rides a watcher callback, and with `distanceFilter: 5` a genuinely stationary phone (or one in Doze) may deliver nothing for long stretches. Day Tracking would show a sparse trail and long empty timeline stretches at customer sites, and the 5-minute watchdog would keep tearing down and re-registering the watcher during those periods (extra churn, no data).
2. **Live/latest location lag.** Uploads now happen at 20 points or 60 s. Admin "current location" and live monitoring can therefore be up to ~a minute behind, where before it was near-real-time.
3. **Cross-user queue poison pill.** The queue is a single global localStorage key holding `user_id` per point, but the database rule allows a user to insert only their own rows. If any point from a previously signed-in user is still queued, every flush fails permanently and blocks the current user's points until the 10 000 cap starts dropping them — i.e. silent data loss on shared devices.

## Proposed corrective work (Phase 1.5)

Small, contained changes; no UI changes, no distance-logic changes.

- Restore stationary trail density without the old 15 s all-day polling: keep the watcher as the only source, but let the watchdog issue a single low-power position request when no callback has arrived for ~2 minutes while the day is open, writing it as a trail-density sample (anchor not advanced) instead of only re-registering the watcher.
- Make the watchdog re-register only after a *failed* health probe, so a stationary user no longer causes a watcher restart every 5 minutes.
- Reduce flush interval for the freshness path: keep batching, but flush on the first point after >20 s of silence so live monitoring stays near-current while still avoiding per-fix writes.
- Fix the poison pill: on flush, drop or quarantine queued points whose `user_id` differs from the signed-in user, and skip a chunk that fails with a permission error instead of retrying it forever.
- Optionally validate on a real device afterwards: one full workday with checkpoints (moving, stationary at site, screen off, airplane mode) comparing point count, trail continuity and total km against a pre-change day.

## Technical notes

Files that would change: `src/hooks/useGPSTracker.ts` (watchdog probe + health logic), `src/services/gpsSyncQueue.ts` (user-scoped filtering, permission-error handling, idle flush), `src/utils/gpsCaptureGate.ts` (new thresholds only). No changes to `gpsDistance.ts`, `googleRoute.ts`, `attendanceGate.ts`, the map components, or `/gps-tracking` UI.
