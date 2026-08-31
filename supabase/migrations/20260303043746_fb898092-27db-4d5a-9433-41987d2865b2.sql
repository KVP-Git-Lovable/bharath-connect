
-- Allow users to delete their own pending expenses
CREATE POLICY "Users can delete own pending expenses"
ON public.additional_expenses
FOR DELETE
USING (user_id = auth.uid() AND status = 'pending');

-- Allow managers to view subordinate expenses
CREATE POLICY "Managers can view subordinate expenses"
ON public.additional_expenses
FOR SELECT
USING (user_id IN (
  SELECT sub.user_id FROM public.get_user_hierarchy(auth.uid()) sub
));

-- Allow managers to update subordinate expenses (for approve/reject)
CREATE POLICY "Managers can update subordinate expenses"
ON public.additional_expenses
FOR UPDATE
USING (user_id IN (
  SELECT sub.user_id FROM public.get_user_hierarchy(auth.uid()) sub
));
