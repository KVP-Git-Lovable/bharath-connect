# Expense Master Vehicle configuration UI plan

## Goal
Improve only the Vehicle area inside `/admin/expenses` → Configuration using the selected **Enterprise Vehicle Master** direction. Keep the current page structure and all existing expense behavior. No backend, database, calculation, permission, or unrelated page changes.

## Selected layout
Keep the existing Vehicle Master heading and actions, then divide the content into three clear stages:

1. **Vehicle Types** — create and maintain the available vehicle list.
2. **Default & Rates** — show the new separate Default section and vehicle rate rows.
3. **Assignments** — manage role access and individual-user exceptions without crowding the rates screen.

The stages are navigation within the existing Configuration page, not separate pages.

## Separate Default section
Place a clearly labelled **Default** section at the top of the Default & Rates stage.

### Header
- Add a two-option **Fixed / Variable** segmented toggle at the top.
- Bind it to the existing TA calculation method:
  - **Variable** uses Rate / km.
  - **Fixed** uses Fixed price / day.
- Keep both columns visible for clarity, but visually emphasize the column controlled by the selected method and disable the other value where existing behavior requires it.

### Default row structure
Use the selected enterprise table layout with these columns exactly:

- **Rate / km**
- **Fixed price / day**
- **Assigned roles**
- **Custom users**
- **Actions**

The first row is the organization-wide default and uses the existing default TA values. Roles show **All roles** when unrestricted. Custom users show a concise count or names, with details opened through the existing selector.

### Additional rows
- Put **Add new row** above and below the table so it remains easy to find.
- Adding a row opens a compact form for the existing supported configuration: amount, assigned roles, and custom users.
- New rows appear immediately below the Default row.
- Reuse existing vehicle, role, group, and user-exception records; do not introduce a new data model.
- If an arbitrary row cannot be represented by the existing records, keep it as a frontend draft until the user selects an existing vehicle or assignment target. Do not write unsupported data.
- Actions use clear edit and delete icons with tooltips; deleting always uses the existing guarded delete behavior.

## Stage 1: Vehicle Types
- Show active vehicle types in compact rows with icon, name, TA applicability, status, and actions.
- Keep Add vehicle, Edit, Activate/Deactivate, and Delete.
- Preserve the approved **Inactive** filter behavior: off shows active vehicles only; on shows active and inactive vehicles.
- Do not mix rates and role controls into this stage.

## Stage 2: Default & Rates
- Show the separate Default section first.
- Below it, show vehicle-specific rates in the same clean row style.
- Keep current ₹/km history and effective-date behavior.
- Keep fixed ₹/day values and no-TA vehicles.
- Clearly label missing rates and save status.

## Stage 3: Assignments
- Show roles as the primary rows, with allowed vehicles visible as checkboxes or compact chips.
- Make **All vehicles** versus **Restricted** immediately visible.
- Preserve the current unrestricted-role rule exactly.
- Put custom-user exceptions in a secondary area or side panel, retaining existing add/edit/remove behavior and amounts.

## Petty Cash and remaining Configuration areas
- Keep Petty Cash as its own existing section with Issue, Edit, Top up, Settle, Reopen, Delete, Search, filters, totals, and transaction details.
- Do not present an “Additional Expense Policy” section.
- Keep the bill-required amount under Claims & Approvals because it controls receipt handling.
- Do not redesign Travel Policy, DA, categories, workflows, approval rules, or Overview as part of this focused change.

## Responsive behavior
- Desktop uses the selected enterprise table treatment with compact spacing and restrained navy/gold emphasis.
- Mobile converts each row into a labelled vertical block in the same field order; no horizontal page scrolling.
- Keep stable control sizes, visible focus states, and explicit statuses such as Active, Inactive, All roles, Restricted, Missing rate, Saving, and Saved.

## Scope safeguards
- Frontend presentation and organization only.
- No migrations, schema changes, new tables, or changed stored values.
- No changes to Activities, Attendance, GPS tracking, reports, expense calculation, submission, or approval logic.
- Reuse the current save handlers and selectors rather than creating parallel functionality.

## Verification
- Confirm the Fixed / Variable toggle still uses the existing TA method.
- Confirm the Default row reads and saves the existing default values.
- Confirm additional rows use only currently supported vehicle/role/user records.
- Confirm vehicle creation, edit, active status, inactive filtering, and guarded deletion still work.
- Confirm rate history, fixed rates, role assignments, unrestricted roles, and custom-user exceptions still work.
- Check desktop and mobile layouts and verify there are no build, runtime, or console errors.
