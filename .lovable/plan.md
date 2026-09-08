# Add Face & GPS Verification toggles to Attendance Policy

Two independent switches in the Attendance Policy page that decide whether the existing face check and the existing location capture run when a user taps "Start My Day". Nothing else changes.

## What I verified in the target project

- The Policy page is built from `AttendancePolicyConfig` → Auto End Day + Leave + Regularization sections. The "Approval Workflow" and "Post-Approval Impact" blocks shown in the screenshot live inside the Regularization section (`RegularizationPolicyConfig.tsx`).
- There is already a general-purpose settings table `attendance_policy` (key / value pairs, currently empty) with RLS in place: admins can manage, all signed-in users can read. So **no database change is needed** — the two toggles are stored as two rows in this existing table.
- Check-in today: "Start My Day" on the Dashboard just navigates to the Attendance page. On the Attendance page, `handleStartDay` opens the camera, then a single handler captures location, uploads the photo, compares it with the profile photo, and finally calls the existing `checkIn(...)`.

## Comparison

| Setting | Currently in target | Action |
| --- | --- | --- |
| Face Verification toggle | Missing (face check always runs) | Add toggle, read at check-in |
| GPS / Location Verification toggle | Missing (location always requested) | Add toggle, read at check-in |
| Everything else on the Policy page | Present | Unchanged |

## What will be built

1. **Two toggles** appended at the bottom of the existing "Approval Workflow" block, using the same label + description + switch pattern already used there:
   - Face Verification — "Require face verification before attendance check-in."
   - GPS / Location Verification — "Require location verification before attendance check-in."
   They save with the section's existing Save button. No layout, spacing, colour, icon or component styling changes.

2. **Reading the settings at check-in** on the Attendance page, applied to the existing flow only:
   - Face ON → existing camera + face-match steps run exactly as today.
   - Face OFF → camera never opens, no camera permission prompt, no photo upload, no face comparison, and the "register your photo first" prompt is skipped.
   - GPS ON → existing location capture runs as today.
   - GPS OFF → location is not requested at all.
   - Whichever combination applies, the day is then started through the same existing check-in call, with the same records written.
   - Face OFF + GPS OFF starts the day immediately on tap.

3. Day End keeps using the same rules so it can never get stuck asking for a photo the policy no longer requires.

## Technical notes

- Storage: two rows in the existing `attendance_policy` table (`policy_key` = `face_verification_required` / `gps_verification_required`). No new tables, columns, functions, triggers, indexes or RLS changes. Defaults to ON when a row is absent, so behaviour is identical to today until an admin turns something off.
- New file: a small `useAttendanceVerificationPolicy` hook (read + save) following the existing policy-hook pattern.
- Edited files: `RegularizationPolicyConfig.tsx` (two switches + save of the two keys) and `Attendance.tsx` (branching in `handleStartDay` / `handleEndDay` / the capture handler). No changes to `useAttendance`, the face-match hook, the camera component, GPS tracking, Dashboard, or any other module.
- Verification: exercise all four combinations in the preview, confirm no camera/location prompt when the matching toggle is off, and confirm existing policy sections still save.
