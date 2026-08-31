-- Allow managers to view attendance of their subordinates
CREATE POLICY "Managers can view subordinate attendance"
ON public.attendance
FOR SELECT
USING (
  user_id IN (
    SELECT sub.user_id FROM get_user_hierarchy(auth.uid()) sub
  )
);

-- Allow managers to view leave applications of their subordinates
CREATE POLICY "Managers can view subordinate leave apps"
ON public.leave_applications
FOR SELECT
USING (
  user_id IN (
    SELECT sub.user_id FROM get_user_hierarchy(auth.uid()) sub
  )
);