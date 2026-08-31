
-- Allow authenticated users to delete their own site assignments or admins to delete any
CREATE POLICY "Users can delete own site_assignments"
  ON public.site_assignments FOR DELETE
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
