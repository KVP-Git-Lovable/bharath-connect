# GPS benchmark fixtures

Drop a real day's `gps_tracking` export here as JSON (an array of rows with
`latitude`, `longitude`, `timestamp`, `accuracy`, `speed`, `heading`) and run
it through `runGpsBenchmark` from `src/utils/gpsBenchmark.ts`:

```ts
import fixture from "@/test/fixtures/gps/2026-08-20-suyog.json";
const report = await runGpsBenchmark(fixture, { referenceKm: 43, snap: null });
console.log(formatGpsBenchmark(report));
```

Pass `referenceKm` when the real road distance is known — it is only compared
against (absolute/percentage error in the report); it never influences the
algorithm. Pass `snap: null` for a deterministic engine-only run, or omit it
to include the live snap-roads stage.
