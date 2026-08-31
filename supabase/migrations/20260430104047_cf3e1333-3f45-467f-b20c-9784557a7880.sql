-- Allow any authenticated user to view active org members for the team attendance overview
CREATE POLICY "Authenticated can view active users"
ON public.users
FOR SELECT
TO authenticated
USING (is_active = true);

-- Allow any authenticated user to view today's attendance for all users (for the team attendance overview)
CREATE POLICY "Authenticated can view today's attendance"
ON public.attendance
FOR SELECT
TO authenticated
USING (date = CURRENT_DATE);

-- Allow any authenticated user to view approved leaves overlapping today (for the team attendance overview)
CREATE POLICY "Authenticated can view approved leaves covering today"
ON public.leave_applications
FOR SELECT
TO authenticated
USING (status = 'approved' AND from_date <= CURRENT_DATE AND to_date >= CURRENT_DATE);