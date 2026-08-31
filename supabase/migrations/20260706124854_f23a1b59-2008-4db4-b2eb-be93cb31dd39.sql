-- Allow security-profile "users" object permission holders to manage employees
DROP POLICY IF EXISTS "Admins can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can update employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can delete employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can view all employees" ON public.employees;

CREATE POLICY "Admins or users-editors can view employees"
ON public.employees FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.can_access_object(auth.uid(), 'users', 'view_all')
  OR public.can_access_object(auth.uid(), 'users', 'read')
);

CREATE POLICY "Admins or users-editors can insert employees"
ON public.employees FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.can_access_object(auth.uid(), 'users', 'create')
  OR public.can_access_object(auth.uid(), 'users', 'edit')
);

CREATE POLICY "Admins or users-editors can update employees"
ON public.employees FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.can_access_object(auth.uid(), 'users', 'edit')
  OR public.can_access_object(auth.uid(), 'users', 'modify_all')
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.can_access_object(auth.uid(), 'users', 'edit')
  OR public.can_access_object(auth.uid(), 'users', 'modify_all')
);

CREATE POLICY "Admins or users-editors can delete employees"
ON public.employees FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.can_access_object(auth.uid(), 'users', 'delete')
);