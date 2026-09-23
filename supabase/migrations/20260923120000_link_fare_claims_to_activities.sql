-- Link a public transport fare to the activity it was paid for.
--
-- A fare is a reimbursement claim, so it belongs in additional_expenses where
-- the approve / reject / auto-approve machinery already lives. This column is
-- what ties one claim to one activity, so editing a fare updates that claim
-- instead of piling up duplicates.
--
-- Additive only: one nullable column. No renames, no drops, no data rewritten.
-- Existing claims keep activity_id NULL and behave exactly as before.
-- Safe to re-run.

ALTER TABLE public.additional_expenses
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activity_events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.additional_expenses.activity_id IS
  'The activity whose public transport fare produced this claim. NULL for a claim entered directly in the Expenses module.';

-- One claim per activity, so a repeated save updates rather than duplicates.
-- Partial index: rows with no activity are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS additional_expenses_activity_id_key
  ON public.additional_expenses (activity_id)
  WHERE activity_id IS NOT NULL;
