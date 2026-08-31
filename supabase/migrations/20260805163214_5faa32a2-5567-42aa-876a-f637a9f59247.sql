-- Assign admin users to System Administrator security profile
-- This ensures roles display correctly in the Users & Roles management page

-- First, ensure all users with 'Admin' role_id are assigned to System Administrator security profile
INSERT INTO public.user_security_profiles (user_id, profile_id)
SELECT u.id, sp.id
FROM public.users u
INNER JOIN public.roles r ON u.role_id = r.id
INNER JOIN public.security_profiles sp ON sp.name = 'System Administrator'
WHERE r.name = 'Admin'
  AND u.id NOT IN (SELECT user_id FROM public.user_security_profiles)
ON CONFLICT (user_id) DO UPDATE SET profile_id = EXCLUDED.profile_id;

-- Assign Field User role to Field Sales Executive security profile
INSERT INTO public.user_security_profiles (user_id, profile_id)
SELECT u.id, sp.id
FROM public.users u
INNER JOIN public.roles r ON u.role_id = r.id
INNER JOIN public.security_profiles sp ON sp.name = 'Field Sales Executive'
WHERE r.name = 'Field User'
  AND u.id NOT IN (SELECT user_id FROM public.user_security_profiles)
ON CONFLICT (user_id) DO UPDATE SET profile_id = EXCLUDED.profile_id;

-- Assign Sales Manager role to Sales Manager security profile
INSERT INTO public.user_security_profiles (user_id, profile_id)
SELECT u.id, sp.id
FROM public.users u
INNER JOIN public.roles r ON u.role_id = r.id
INNER JOIN public.security_profiles sp ON sp.name = 'Sales Manager'
WHERE r.name = 'Sales Manager'
  AND u.id NOT IN (SELECT user_id FROM public.user_security_profiles)
ON CONFLICT (user_id) DO UPDATE SET profile_id = EXCLUDED.profile_id;

-- Assign Data Viewer role to Data Viewer security profile
INSERT INTO public.user_security_profiles (user_id, profile_id)
SELECT u.id, sp.id
FROM public.users u
INNER JOIN public.roles r ON u.role_id = r.id
INNER JOIN public.security_profiles sp ON sp.name = 'Data Viewer'
WHERE r.name = 'Data Viewer'
  AND u.id NOT IN (SELECT user_id FROM public.user_security_profiles)
ON CONFLICT (user_id) DO UPDATE SET profile_id = EXCLUDED.profile_id;

-- Ensure System Administrator profile has SBEE module permissions
DELETE FROM public.profile_object_permissions
WHERE profile_id IN (SELECT id FROM public.security_profiles WHERE name = 'System Administrator')
  AND object_name LIKE 'module_%';

INSERT INTO public.profile_object_permissions (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, obj.name, true, true, true, true, true, true
FROM public.security_profiles sp
CROSS JOIN (VALUES
  ('module_activities'),
  ('module_attendance'),
  ('module_leads'),
  ('module_gps_tracking'),
  ('module_reports'),
  ('module_admin_panel'),
  ('module_expenses')
) AS obj(name)
WHERE sp.name = 'System Administrator'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_object_permissions pop
    WHERE pop.profile_id = sp.id AND pop.object_name = obj.name
  );
