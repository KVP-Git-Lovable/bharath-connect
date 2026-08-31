
-- Allow managers to view subordinate GPS tracking data
CREATE POLICY "Managers can view subordinate GPS"
ON public.gps_tracking
FOR SELECT
TO authenticated
USING (user_id IN (SELECT sub.user_id FROM get_user_hierarchy(auth.uid()) sub(user_id, level)));

-- Allow managers to view subordinate GPS stops
CREATE POLICY "Managers can view subordinate GPS stops"
ON public.gps_tracking_stops
FOR SELECT
TO authenticated
USING (user_id IN (SELECT sub.user_id FROM get_user_hierarchy(auth.uid()) sub(user_id, level)));
