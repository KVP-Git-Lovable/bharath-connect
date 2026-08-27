# Git sync diagnosis and cleanup

## What I found

Git sync is **not** broken. All the commits you listed are present in the project right now:

```text
c8e2dce Changes                      <- Lovable-side commit on top
3914092 Cache buster - force Lovable rebuild
38d13f8 Fix: Improve 'New Activity' button clickability
8c16edb Force rebuild
d596baf Trigger final rebuild
360fcf9 Fix: Separate Activity Check-in from Day Attendance
```

The working tree is clean, so the token is valid and nothing is stuck. Answers to your questions:

1. Lovable **is** pulling — latest commit `3914092` is here.
2. Auth token is fine; a disconnected token would block the push and show an error state.
3. Nothing on the server is stale. What is stale is the **browser/service-worker cache on your device**.
4. A rebuild is not needed; the code already matches GitHub.
5. The dashboard difference is a client cache issue, not a repo issue — with one real code bug on top (below).

Verified against the current code:
- `Dashboard.tsx` no longer renders a Pending Expenses card.
- `AppHeader.tsx`, `More.tsx`, `AdminControls.tsx` contain no Expenses entries.

So if you still see the Pending Expenses card, you are looking at a cached bundle served by the installed service worker.

## Real bug found in the console

Your logged-in user resolves as:

```text
role: "user", secProfileName: "Administrator", isAdmin: false
```

`useUserProfile.ts` only treats the security profile name `"System Administrator"` as admin. Your profile is named `"Administrator"`, so admin detection fails and admin-only UI stays hidden. `useAutoAssignRoles.ts` has the same mismatch — its role-to-profile map points `Admin` at `"System Administrator"`.

## What I will change

1. **Fix admin detection** — in `useUserProfile.ts`, match security profile names case-insensitively against both `Administrator` and `System Administrator`, so either naming works.
2. **Align auto-assign mapping** — in `useAutoAssignRoles.ts`, look up the admin security profile by either name instead of the single hardcoded string.
3. **Quiet the log spam** — the `User profile state:` log fires on every render (dozens of lines per page load). Move it behind a dev-only guard.
4. **Remove the leftover `pendingExpenses` destructure** in `Dashboard.tsx` and the now-unused `Receipt` icon import, left over from the card removal.
5. **Fix the React ref warning** from `WorkforceOverviewSection` (function component receiving a ref) by wrapping it in `React.forwardRef` or dropping the ref, so the error boundary logs stay clean.

## What you need to do on your device

Server-side rebuild will not clear an installed service worker. On the device showing the old dashboard, once:

- Open the app, hard-refresh (Ctrl/Cmd+Shift+R), or
- On mobile: close all app tabs and reopen, or clear site data for the app domain.

The app's existing `cacheVersion.ts` build-ID check will then converge and stop showing the old shell.

## Technical notes

- No git operations are needed and I will not run any — the repo state is already correct.
- Files touched: `src/hooks/useUserProfile.ts`, `src/hooks/useAutoAssignRoles.ts`, `src/pages/Dashboard.tsx`, `src/components/dashboard/WorkforceOverviewSection.tsx`.
- No database or edge function changes.
