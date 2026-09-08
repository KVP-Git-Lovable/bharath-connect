# Sync the Attendance Policy page from Staging - Quickapp

Scope: only Attendance → Configuration → Policy (`/admin/attendance`). No other tab, page, route, or module is touched.

## Comparison: source → target status → action

**Section 1 — Auto End Day Policy**

| Source feature | Target status | Action |
| --- | --- | --- |
| Whole "Auto End Day Policy" card | Missing entirely | Add |
| Enable/disable switch in the card header | Missing | Add |
| Auto-Close Time (time picker) | Missing | Add |
| Timezone dropdown (6 zones) | Missing | Add |
| Last Activity Detection (All Activity / Last Order Only / Last App Interaction) | Missing | Add |
| Pre-Warning Notification toggle + warning time | Missing | Add |
| Visit handling: close in-progress, cancel planned, mark unproductive | Missing | Add |
| Loading spinner, error alert, "no policy yet" alert, fallback alert | Missing | Add |
| Save button with saving state and toasts | Missing | Add |
| Storage for all of the above | Missing table | Add new settings table |

**Section 2 — Leave Policy**

| Source feature | Target status | Action |
| --- | --- | --- |
| Master enable/disable switch | Missing | Add |
| Reset cycle incl. custom reset date | Partial (no custom date) | Extend |
| Negative balance allowance + limit | Present, different field names | Map to renamed fields |
| Carry forward: enable, limit, expiry months | Partial (no expiry) | Extend |
| Notice period, max continuous days, backdated leave, half-day, sandwich rule | Present | Keep |
| Per-leave-type overrides dialog (negative balance, carry forward, expiry, custom cycle) | Partial fields only | Extend |
| Per-leave-type accrual settings (type, yearly entitlement) | Missing | Add |
| Accrual configuration (frequency, divisor, rounding, pro-rate on joining, credit day) | Missing storage | Add new settings table |
| Loading / error / fallback states, save toasts | Missing | Add |

**Section 3 — Regularization Policy**

| Source feature | Target status | Action |
| --- | --- | --- |
| Enable/disable switch | Missing | Add |
| Monthly limit incl. "unlimited" mode, daily limit | Partial | Extend |
| Max backdate days, approval mode | Present | Keep |
| Allow previous month, restrict after payroll lock | Missing | Add |
| Allow editing check-in / check-out / status, reason mandatory | Missing | Add |
| Update attendance on approval, recalculate hours, adjust leave balance | Missing | Add |
| Loading / error / fallback states, save toasts | Missing | Add |

## Database work (additive only)

Nothing is dropped, renamed away, or emptied. Existing rows, policies, and unrelated tables stay as they are. Approvals happen through the normal migration review.

1. New table `auto_end_day_policy` — enabled flag, auto-close time, timezone, last activity source, pre-warning flag/time, three visit-handling flags, timestamps. Grants + row-level rules mirroring the existing policy tables (admins manage, signed-in users read).
2. New table `accrual_config` — frequency, divisor, rounding mode, pro-rate on joining, credit day, timestamps, same access rules.
3. Add missing columns (all with safe defaults, `ADD COLUMN IF NOT EXISTS`):
   - `global_leave_policy`: `is_enabled`, `custom_reset_date`, `max_negative_limit`, `enable_carry_forward`, `max_carry_forward_limit`, `carry_forward_expiry_months`, `min_notice_period_days`, `max_continuous_leave_days`, `enable_half_day`, `enable_sandwich_rule`. Existing similarly-named columns are backfilled into the new ones and left in place.
   - `leave_type_policy_override`: `override_enabled`, `allow_negative_balance`, `max_negative_limit`, `enable_carry_forward`, `max_carry_forward_limit`, `carry_forward_expiry_months`.
   - `regularization_policy`: `is_enabled`, `allow_checkin_edit`, `allow_checkout_edit`, `allow_status_edit`, `reason_mandatory`, `allow_previous_month`, `restrict_after_payroll_lock`, `update_attendance_on_approval`, `recalculate_hours`, `adjust_leave_balance`.
4. No source data is copied. New rows are seeded with defaults only if no row exists.

## Code work

- Add `src/utils/policyDefaults.ts` (shared defaults + error logging helper, from source).
- Add `src/hooks/useAutoEndDayPolicy.ts` (from source).
- Rewrite `src/hooks/useGlobalLeavePolicy.ts` and `src/hooks/useRegularizationPolicy.ts` to the source versions. Both hooks are used only by the two policy cards, so nothing else is affected.
- Add `src/components/attendance/AutoEndDayPolicyConfig.tsx`; replace `LeavePolicyConfig.tsx` and `RegularizationPolicyConfig.tsx` with the source versions.
- Update `AttendancePolicyConfig.tsx` to render the three cards in source order.
- Existing shared UI components are reused; no theme or layout component changes.

## Not included

The Auto End Day settings are stored and editable, but the scheduled job that actually closes days at the configured time lives outside the Policy page and is not part of this task. The settings page will work; the automatic closing itself would need a separate follow-up.

## Verification

- Policy page loads with three sections, values load and save, toasts appear.
- Leave Types, Holidays, Working Days, Live Attendance, Leave Management, Regularization, Reports tabs unchanged and still working.
- Existing policy rows still readable with original values intact.
- Typecheck, tests, and build clean; no console errors on the page.
