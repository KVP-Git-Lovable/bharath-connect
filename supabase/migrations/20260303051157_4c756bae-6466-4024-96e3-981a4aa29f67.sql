
-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users can insert own activities" ON public.activity_events;

-- Create new INSERT policy that allows self-insert OR manager-insert for subordinates
CREATE POLICY "Users and managers can insert activities"
ON public.activity_events FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR user_id IN (SELECT sub.user_id FROM get_user_hierarchy(auth.uid()) sub)
);
