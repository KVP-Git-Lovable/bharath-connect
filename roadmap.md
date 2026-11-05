# Roadmap

- [x] Fix "Shravan k" showing as Team Member / missing nav modules (client-side cache scoped per user)
- [x] Fix all typecheck build errors
  - [x] Added missing backend schema: `list_views` table + `activity_events` travel/manual-distance columns
  - [x] Edge function TS errors (unknown catch types, client generics, PDF buffer, magic-link API)
- [x] Modernize `/admin/expenses` UI only, remove duplicate navigation, and preserve all expense behavior
- [x] Prepare a revised frontend-only Expense Master UI plan and visual options from the supplied references; no backend changes
- [x] Implement the approved Enterprise Vehicle Master UI in Expense Configuration only; no backend changes
- [x] Apply Android foreground-service promotion and permission-aware restart fixes; preserve GPS filters and existing modules
- [x] Validate clean plugin patch application, lifecycle checks, 10 native policy tests and 70 GPS/distance/activity regression tests
- [ ] Compile/release a new APK and test screen-lock, Recents swipe, reboot and Xiaomi background tracking — blocked by missing Android SDK/generated Cordova project and physical device access
