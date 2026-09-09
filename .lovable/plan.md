# Rename TA Calculation Method Dropdown Label

## Scope
Make a single user-facing label change on the Expense Master Configuration page (`/admin/expenses`).

## Change
Rename the dropdown option label **"From GPS Tracking"** to **"Variable Amount"** wherever it appears in the TA Policy configuration UI.

## Files to update
- `src/components/expenses/ExpensePolicyConfig.tsx` — TA Calculation Method dropdown (main policy)
- `src/components/expenses/ExpenseGroupsInline.tsx` — TA Type dropdown inside group overrides

In both places, only the text between the `<SelectItem value="from_gps">` tags changes. The underlying value stays `from_gps`, and no logic, calculations, database values, enum values, variables, or API calls are modified.

## What is preserved
- TA calculation logic and GPS-based functionality
- Expense calculations and approval workflows
- Database structure and existing data
- Overview tab and all other UI
- All other configuration settings

## Verification
- Open `/admin/expenses` → Configuration → Travel Allowance (TA) Policy.
- Confirm the dropdown now shows:
  - Variable Amount
  - Fixed Amount
- Select "Variable Amount", save policies, and confirm the existing behavior continues unchanged.
- Run the preview build/typecheck and confirm no new errors.
