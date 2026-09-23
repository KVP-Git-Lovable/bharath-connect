-- The category public transport fares are filed under.
--
-- utils/fareClaim.ts matches this row by name, so the claim it files can carry
-- a category_id and pick up that category's auto-approval limit.
--
-- Insert only, guarded by NOT EXISTS: nothing existing is read back, updated or
-- removed, and re-running adds nothing. There is no unique constraint on
-- expense_categories.name, hence the guard rather than ON CONFLICT.

INSERT INTO public.expense_categories (name, is_active, auto_approval_limit)
SELECT 'Public Transport', true, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories WHERE name = 'Public Transport'
);

-- auto_approval_limit is deliberately NULL: with no limit set, every fare goes
-- to an approver. Deciding an amount that pays out without review is a policy
-- call, so set it in Expense Master -> Configuration -> Expense Categories.
