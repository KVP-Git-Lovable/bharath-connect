-- Ensure Ajay Prabhu is assigned as System Administrator
-- Find Ajay by email and assign to System Administrator role

-- First, update users.role_id to 'Admin' for Ajay
UPDATE public.users
SET role_id = (SELECT id FROM public.roles WHERE name = 'Admin' LIMIT 1)
WHERE email LIKE '%ajay%prabhu%' OR email LIKE '%ajay.prabhu%' OR full_name LIKE '%Ajay%Prabhu%';

-- Then assign to System Administrator security profile
INSERT INTO public.user_security_profiles (user_id, profile_id)
SELECT u.id, sp.id
FROM public.users u
CROSS JOIN public.security_profiles sp
WHERE (u.email LIKE '%ajay%prabhu%' OR u.email LIKE '%ajay.prabhu%' OR u.full_name LIKE '%Ajay%Prabhu%')
  AND sp.name = 'System Administrator'
  AND u.id NOT IN (SELECT user_id FROM public.user_security_profiles WHERE profile_id = sp.id)
ON CONFLICT (user_id, profile_id) DO NOTHING;

-- Ensure System Administrator has full SBEE permissions
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
  ('module_procurement'),
  ('module_customers'),
  ('module_opportunities'),
  ('module_my_team'),
  ('module_sites'),
  ('module_events')
) AS obj(name)
WHERE sp.name = 'System Administrator'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_object_permissions pop
    WHERE pop.profile_id = sp.id AND pop.object_name = obj.name
  );
