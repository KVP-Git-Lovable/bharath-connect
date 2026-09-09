# Expense Master visual modernization

## Confirmed current structure

- `/admin/expenses` has the required primary `Overview / Configuration` navigation.
- The duplicate layer comes from the Overview content adding a second `Approvals / Overview` tab set; it also defaults to Approvals, which hides the expense summary and creates the confusing repeated labels.
- The existing Overview already has real month-scoped team totals, TA/DA/Additional values, approval amounts, claims, report generation, team-member summaries, receipt viewing, approve/reject actions, and rejection reasons.
- The current preview is healthy (`build OK`).

## Selected visual direction

Build the chosen **Soft glass fluid dashboard** as a controlled refinement of the current app:

- Retain the navy-and-gold product identity.
- Use soft role-like accent surfaces inspired by the supplied reference: blue for Travel, violet for Additional, green for positive/approved states, and orange for pending attention.
- Use Outfit-style headings and Figtree-style body typography on this page only, without changing unrelated pages.
- Keep the result compact and professional: thin borders, restrained shadows, consistent small corner radii, and subtle interaction feedback rather than decorative effects.

## Implementation

1. **Clean the navigation hierarchy**
   - Keep exactly one `Overview / Configuration` segmented control.
   - Remove the nested `Approvals / Overview` tabs while retaining all approval records, actions, and states inside the Overview.
   - Keep Configuration rendering the existing policy component unchanged.

2. **Refine the page header and month control**
   - Preserve the back action, icon, title, and exact subtitle.
   - Improve alignment, hierarchy, icon treatment, and vertical density.
   - Place the existing previous/month/next controls in the Overview heading row on wider screens and stack them cleanly on mobile; do not alter date logic.

3. **Build the executive summary from existing values**
   - Lead with Grand Total, followed by Travel (TA), Daily (DA, when enabled), and Additional.
   - Apply the selected soft color-coded surfaces, clear icons, stronger amounts, and existing supporting labels/counts.
   - Keep all current calculations and sources unchanged.

4. **Clarify approval status and insights**
   - Present Approved, Pending, and Rejected as consistent status cards with their existing amounts and real claim counts.
   - Add compact Expense Breakdown and Approval Progress bars calculated only from the totals and expense rows already loaded by the page.
   - Handle zero totals safely with an intentional empty/zero state; never invent percentages or records.

5. **Preserve and organize the working areas**
   - Keep report generation and all existing filters/downloads intact, with presentation aligned to the refreshed page.
   - Keep the existing team-member summaries.
   - Present existing expense approvals as a clear Pending Approvals workspace while retaining approve, reject, receipt, and rejection-reason behavior; historical/non-pending records remain accessible in the same Overview rather than through duplicate navigation.
   - Preserve current empty and loading states with more compact spacing.

6. **Responsive and accessibility pass**
   - Adapt cards and insight panels from four-column desktop to two-column tablet and single/two-column mobile layouts without horizontal page scrolling.
   - Keep touch targets, visible focus states, readable contrast, reduced-motion behavior, and non-overlapping text.

## Scope and verification

- Modify only the `/admin/expenses` presentation files needed for this page; no database, API, business-rule, calculation, permission, route, or other-module changes.
- Verify the Overview and Configuration switch, month navigation, zero-data and populated-data rendering, report filters, receipt/reason controls, approve/reject interactions, and desktop/mobile layouts.
- Run focused type checks/tests and confirm the preview has no build, runtime, or console errors.
