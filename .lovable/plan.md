# GPS regression: what the snippet raised vs. what is already in the code

## Verified current state

Code read this turn (`src/hooks/useGPSTracker.ts`, `src/utils/gpsCaptureGate.ts`, `src/services/gpsSyncQueue.ts`) plus a query of `gps_tracking` for 31 Aug – 2 Sep.

Snippet cause 1 — "probe success masks a dead watcher": **already fixed** (Phase 1.6).
- Watcher health no longer depends on the probe: any watcher silence beyond the watchdog window re-registers the watcher (`useGPSTracker.ts`, watchdog block ~line 320-362).
- The stationary probe now runs with `enableHighAccuracy: true` (was `false`).
- Probe fixes worse than 50 m are discarded (`PROBE_MAX_ACCURACY_M` in `gpsCaptureGate.ts`).

Snippet cause 2 — "points stuck in the local queue": **partly addressed**.
- Permission/RLS failures (42501, PGRST301) drop the chunk instead of retrying forever; foreign-user points are dropped via `setGpsQueueOwner`.
- Still missing: any way to *see* the queue. There is no exported queue-depth/last-error readout and no on-screen diagnostic, so "capture works but sync is stuck" can only be distinguished by attaching Chrome DevTools to the device.

Not covered by the snippet, and visible in today's data:

```text
date        pts   first → last                     avg accuracy   fixes at exactly 35 m
2026-09-02  122   01 Sep 19:22 → 02 Sep 09:19      34.4 m         113 / 122
2026-09-01  195   03:19 → 18:19                    35.0 m         177 / 195
2026-08-31  106   11:47 → 13:10                    33.1 m          94 / 106
```

Points *are* arriving today (122), so the watcher is not dead and sync is not stuck on this device. The real problem is that essentially every fix has accuracy exactly 35 m — a coarse network/fused fix, not GPS. The movement gate compares distance against the sum of the two fixes' accuracies (~70 m), so a normal walking/driving trail never clears the gate and the day flattens to 0 km. The 50 m guard only applies to probe fixes, so 35 m coarse fixes from the watcher pass straight through.

Also still true: no attendance row since 31 Aug has a check-out, so the tracker runs overnight (the 02 Sep row starts at 19:22 the previous evening).

## Plan

1. **Accuracy quality gate on all fixes, not just probes.** Apply a maximum-accuracy threshold to every incoming watcher fix, and treat fixes whose accuracy is a suspicious constant (the 35 m fused-provider signature) as non-GPS: keep them for "last known position" display but exclude them from the distance engine.
2. **Cap the movement threshold.** Stop letting `accuracy(a) + accuracy(b)` grow unbounded — clamp it to a sane ceiling (e.g. 30-40 m) so coarse fixes can no longer suppress all movement. This alone restores non-zero distance on days like today.
3. **Force a real GPS request path.** Verify the watcher options actually request high accuracy in both the web and native (patched plugin) paths; if the patched `LocationRequest` is falling back to balanced/low power, correct it so the OS returns GPS-grade fixes.
4. **Make the queue observable.** Export queue depth, dropped count and last sync error, and surface them in the existing GPS diagnostics/debug readout so cause 2 can be checked from the device without DevTools.
5. **Close the check-out hole.** Ensure the tracker stops when the attendance day ends (auto-stop on a stale open attendance row past a cutoff), so overnight rows stop polluting day totals.
6. **Verify.** Typecheck, run the GPS unit tests (extend them with a coarse-fix / clamped-threshold case), then re-query `gps_tracking` after the next field session to confirm accuracy distribution improves and Day Tracking distance is non-zero.

## Technical notes

- Files touched: `src/utils/gpsCaptureGate.ts` (accuracy gate + clamped movement threshold), `src/hooks/useGPSTracker.ts` (watcher options, diagnostics), `src/services/gpsSyncQueue.ts` (exported stats), the GPS diagnostics UI panel, and the native plugin patch under `patches/` if step 3 finds a problem.
- No changes to Day Tracking UI layout, snapping, or attendance business rules beyond the auto-stop in step 5.
- Steps 1-2 are the fix for the 0 km symptom; steps 3-5 are hardening and observability.
