# Expense Master Configuration UI Modernization

## Scope
Improve only **Expense Master → Configuration** at `/admin/expenses`. Keep the approved Overview tab byte-for-byte untouched in its own component, and make no database, backend, calculation, permission, routing, or data changes.

## Current configuration areas to preserve
- Travel Allowance policy, calculation method, GPS/fixed rate, rate history, and distribution overrides
- Daily Allowance policy, applicability, amount, basis, and distribution overrides
- Additional Expenses limits and receipt threshold
- Expense Categories and all add/edit/delete/active controls
- Approval Workflows and all expand/add/edit/delete controls
- Approval Rules, priority guidance, form, table, and delete action
- Group overrides, member management, dialogs, helper text, loading states, validation, and Save Policies behavior

## Implementation
1. **Use the available width only inside Configuration**
   - Give the Configuration content a wider responsive frame aligned with the Expense Master header and tab bar.
   - Keep comfortable page padding at desktop, tablet, and mobile sizes without altering the Overview container or navigation.

2. **Create a consistent section hierarchy**
   - Restyle each existing major section as a restrained enterprise settings card with a semantic accent, icon header, supporting description, subtle border/shadow, and consistent internal spacing.
   - Keep all existing labels and settings; add only short descriptive copy where needed to clarify an existing section.
   - Group the policy sections separately from categories and approval management through spacing and headings, without adding new settings.

3. **Improve responsive field arrangement**
   - Use wider label/control rows and logical two- or three-column grids for related settings on desktop.
   - Collapse cleanly to stacked controls on smaller screens.
   - Keep long rate-history, override, category, and rule tables readable with contained horizontal scrolling rather than page overflow.

4. **Polish existing controls without changing behavior**
   - Standardize input/select heights, labels, helper text, switches, radio choices, action buttons, empty states, and focus/hover presentation.
   - Refine rate history, user/team overrides, expense groups, workflow rows, rule forms, and dialogs so they visually belong to the same Configuration system.
   - Use existing semantic design tokens and shared UI controls; no hardcoded palette or global theme changes.

## Files and isolation
- Update only the Configuration presentation component and its Configuration-only child views: `ExpensePolicyConfig`, `TaRateHistory`, `OverrideTable`, and `ExpenseGroupsInline`.
- Do not modify `TeamExpenseSummary` or any Overview markup, data, calculations, spacing, or styling.
- Do not alter configuration handlers, API calls, persistence, validation, records, or schemas.

## Verification
- Compare desktop and mobile views for width use, alignment, readable hierarchy, and absence of horizontal page overflow.
- Confirm every existing section, field, helper, table, dialog, toggle, dropdown, and button remains available.
- Exercise Configuration tab switching and representative non-destructive interactions, including conditional TA/DA controls and open/close forms/dialogs.
- Confirm existing values remain unchanged and Save Policies still invokes the existing save path.
- Verify the Overview is visually and functionally unchanged, TypeScript passes, and the preview build has no new errors.
