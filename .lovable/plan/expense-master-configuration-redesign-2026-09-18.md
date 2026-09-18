# Expense Master Configuration redesign

## Goal
Make `/admin/expenses` simple to understand without changing expense calculations, stored data, permissions, or other modules. Use the selected **Clean policy split** direction while retaining the product’s navy-and-gold identity.

## Page structure
- Keep the existing Expense Master page and its Overview/Configuration navigation.
- Reorganize Configuration into four clear sections: **Travel Policy**, **Vehicle Master**, **Petty Cash**, and **Claims & Approvals**.
- Use a compact section switcher so administrators work on one focused area at a time instead of scrolling through one long form.
- Preserve the current TA, DA, categories, workflows, rules, and save behavior inside their appropriate sections.

## Vehicle Master
Build one focused workspace with exactly three stages:

1. **Vehicle Types**
   - List active vehicles first in concise cards.
   - Add, rename, activate/deactivate, and remove a vehicle using the existing actions.
   - Keep the existing “show inactive” behavior: off shows active vehicles only; on shows both.

2. **Rates**
   - Show every selected vehicle with its existing payment method and ₹/km or fixed daily amount.
   - Allow direct editing with clear saved/loading/error feedback.
   - Retain existing rate history and no-TA vehicle behavior.

3. **Role Assignment**
   - Present roles in a simple assignment list or matrix with selected vehicles visible at a glance.
   - Preserve the existing unrestricted-role rule and custom user exceptions.
   - Keep all current role and user assignment data unchanged.

A visible three-step header will show the current stage and allow moving between completed stages without opening several nested panels.

## Petty Cash
- Remove the old additional-expense-policy presentation from this page.
- Place the existing Petty Cash tools in their own first-class section.
- Show concise totals for issued, spent, available, and unsettled cash.
- Keep existing actions: issue, update, top up, settle, and view transaction details.
- Preserve existing calculations, employee selection, payment modes, and stored records.

## Visual treatment
- Follow the selected clean, separated layout with white working surfaces, restrained borders, navy actions, and gold emphasis.
- Use existing design tokens and controls; no new generic blue/purple styling.
- Keep forms compact, labels plain, and status wording explicit.
- Make the layout adapt cleanly to mobile: section switcher scrolls horizontally and vehicle stages stack vertically.

## Scope safeguards
- Frontend presentation and organization only.
- No database migrations or schema changes.
- No changes to Activity, Attendance, expense calculations, approvals, or unrelated pages.
- Reuse the existing Vehicle TA and Petty Cash operations rather than building parallel logic.

## Verification
- Confirm adding/editing/activating a vehicle still works.
- Confirm ₹/km and fixed rates save and rate history remains available.
- Confirm role and custom-user assignments still save correctly.
- Confirm inactive filtering behaves as requested.
- Confirm petty cash issue, edit, top-up, settle, and details flows remain functional.
- Check desktop and mobile layouts, then verify the preview has no build or runtime errors.
