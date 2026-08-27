# Fix APK errors: activity permission error + location prompt

Two separate problems, both confirmed by checks just run.

## 1. "permission denied for function get_subordinate_users"

Confirmed in the database: `get_subordinate_users(_manager_id uuid)` currently has **no EXECUTE grant for the signed-in role**, while sibling functions (`get_user_hierarchy`, `get_dashboard_summary`) do have it. It is used inside the row-access rule "Managers can view subordinate activities" on the activities table, so every activity read by a manager fails.

This is not an Android issue and I *can* fix it here — the backend is reachable from this project. Fix: a migration restoring execute access to signed-in users (and admin/service usage), leaving anonymous visitors without it.

## 2. "Unable to get location" inside the APK

Confirmed in code: two plugins ask for location at the same moment.
- `useNativeStartup()` runs from `AppLayout` (after login) and calls `Geolocation.requestPermissions()`.
- `useGPSTracker` registers a background-location watcher with `requestPermissions: true` at the same time.

Android delivers one callback and abandons the other, so location is never actually granted and the app falls back to the browser geolocation path, which has no OS access inside the WebView and times out with exactly that message.

Changes:
- Move `useNativeStartup()` out of `AppLayout` and into the app root so permissions are requested at launch, before any tracking hook mounts.
- Gate the background watcher in `useGPSTracker`: check current location permission first, and only register the watcher once it is granted (`requestPermissions: false` there, so it never races the startup request).
- If permission is missing, log and skip rather than falling through to the failing web path.

## 3. "APK shows an older version"

The Capacitor config bundles the local `dist` build into the APK (remote loading is off), so the APK only changes when it is rebuilt from a fresh `dist`. No code change is needed — after these fixes are merged, rebuild:

```text
git pull
npm install
npm run build
npx cap sync android
npx cap run android
```

I also bump the release token in `capacitor.config.ts` so the WebView drops any cached shell from the previous install.

## Technical notes

- Migration: `GRANT EXECUTE ON FUNCTION public.get_subordinate_users(uuid) TO authenticated, service_role;`
- `src/App.tsx`: call `useNativeStartup()` at root.
- `src/components/layout/AppLayout.tsx`: remove the `useNativeStartup()` call and import.
- `src/hooks/useGPSTracker.ts`: `Geolocation.checkPermissions()` gate before `addWatcher`, `requestPermissions: false`.
- `capacitor.config.ts`: bump `RELEASE_TOKEN`.

Verification of the location prompt still requires a real device or emulator — I cannot run an Android build here.
