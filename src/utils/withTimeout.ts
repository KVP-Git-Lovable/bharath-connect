/**
 * Some Capacitor plugin calls never settle on certain Android versions or
 * under certain conditions (observed: duplicate concurrent
 * Geolocation.requestPermissions() calls silently abandon one of the two
 * callbacks — see useNativeStartup.ts and nativePermissions.ts — and some
 * DeviceSettings bridge calls have no guaranteed resolve/reject path either).
 * An unguarded await on one of these can block an entire acquisition pipeline
 * indefinitely, with no error to catch and nothing logged. Race every such
 * call against a timeout instead of awaiting it directly.
 *
 * Single shared implementation — previously duplicated in useNativeStartup.ts
 * alone; now also used by nativePermissions.ts and useGPSTracker.ts.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}
