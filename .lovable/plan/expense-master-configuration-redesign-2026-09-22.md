# Expense Master Configuration redesign

## Goal
Make `/admin/expenses` Configuration simple and task-focused while preserving every existing expense rule, calculation, record, permission, and action. The Overview tab and unrelated modules will remain unchanged.

## New Configuration structure
Replace the long scrolling page with a compact section switcher:

1. **Travel Policy** — existing TA and DA settings, distribution choices, team/user exceptions, and Save Policies behavior.
2. **Vehicle Master** — vehicle creation, rates, and access assignments in one guided workspace.
3. **Petty Cash** — the existing petty-cash tools promoted to their own clear section.
4. **Claims & Approvals** — receipt requirement, expense categories, workflows, and approval rules.

Only one section is shown at a time. The switcher remains visible and becomes horizontally scrollable on small screens.

## Vehicle Master: three stages
Use a clear three-stage header with the current stage highlighted and a short completion summary for the others.

### 1. Vehicle Types
- Show compact vehicle rows/cards with icon, name, status, and whether travel allowance applies.
- Keep Add, Edit, Activate/Deactivate, and Delete actions.
- Preserve the approved inactive filter: off shows active vehicles only; on shows active and inactive vehicles.
- Show missing setup clearly, such as a vehicle without a rate, without mixing rate editing into this stage.

### 2. Rates
- Show one focused rate list for all applicable vehicles.
- Display and edit either **₹/km** or **fixed ₹/day**, based on the existing TA method.
- Keep “no travel allowance” vehicles read-only and clearly labelled.
- Preserve rate history, effective-date behavior, custom employee amounts, and existing save/error feedback.

### 3. Role Assignment
- Organize assignments by role rather than hiding every role inside each vehicle row.
- Each role shows its available vehicles as clear checkboxes or selection chips.
- Make “all vehicles” and restricted access immediately visible.
- Preserve the current rule that a role with no stored restrictions can use every active vehicle.
- Keep individual employee exceptions available in a secondary area without crowding the main role assignment screen.

## Petty Cash
- Remove any remaining “Additional Expense Policy” presentation from the Configuration page.
- Keep the required receipt amount under **Claims & Approvals**, because it still controls claims.
- Give Petty Cash its own section with concise totals for issued this month, spent, available balance, and open advances.
- Preserve Issue, Edit, Top up, Settle, Reopen, Delete, Search, Filter, and transaction-detail actions.
- Keep the existing employee, payment mode, purpose, reference, date, spending, and balance calculations unchanged.

## Visual direction
- Use the existing navy-and-gold identity, semantic colors, and shared controls.
- Use restrained borders, compact spacing, small corner radii, clear status labels, and one primary action per workspace.
- Avoid nested cards and the current wide table that combines vehicle, rate, role, employee exception, status, and actions in one row.
- Desktop: wide working area with aligned columns. Mobile: stacked rows, full-width controls, and no page-level horizontal overflow.
- Keep feedback explicit: Saving, Saved, Missing rate, Active, Inactive, Restricted, and All vehicles.

## Scope safeguards
- Frontend organization and presentation only.
- No database migrations, new tables, duplicate storage, or changed calculations.
- Reuse the current Vehicle TA and Petty Cash operations rather than building parallel logic.
- Do not change Overview, Activities, Attendance, GPS tracking, expense submission, reports, or navigation outside this page.

## Verification
- Test vehicle add/edit/delete, activation, inactive filtering, and no-TA behavior.
- Test ₹/km and fixed daily rates, rate history, and custom employee amounts.
- Test unrestricted and restricted role assignments without changing their meaning.
- Test every Petty Cash action and verify totals remain consistent.
- Test deferred Save Policies changes separately from controls that save immediately.
- Verify desktop and mobile layouts, keyboard/focus behavior, and no build, runtime, or console errors.
