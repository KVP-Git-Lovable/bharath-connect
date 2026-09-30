# Fix DA "Applicable" setting and hide DA when off

## What's wrong
The DA "Applicable" Yes/No switch in Expense Master has no place to be stored in the database. So:
- Saving fails with "Failed to save" (for both Yes and No).
- The Expenses page can't read the setting, so it always shows DA.

The Expenses page already hides the DA tab, the DA card and the DA amount in the total when the setting is No. It just never gets the real value.

## Fix
1. Add a Yes/No "DA applicable" field to the expense settings in the database. It defaults to Yes, so current behaviour doesn't change until an admin turns it off.
2. No other screen changes. Once the value saves, the Expenses page will:
   - **Yes:** show the DA tab (next to TA), the DA card, and include DA in the total.
   - **No:** hide the DA tab and the DA card, and leave DA out of the total.

## Technical details
- Migration: `ALTER TABLE public.expense_master_config ADD COLUMN IF NOT EXISTS da_applicable boolean NOT NULL DEFAULT true;` The existing grants and access rules still apply.
- `ExpensePolicyConfig.tsx` already writes `da_applicable`, and `useDaApplicable` / `Expenses.tsx` already read it. No code change is expected beyond the regenerated types.
- To check the fix: toggle No, save, and confirm the DA tab disappears on /expenses. Then toggle Yes and confirm it comes back.
