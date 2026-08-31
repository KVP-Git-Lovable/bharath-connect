-- Ensure all admin users are properly assigned roles
-- This fixes the issue where some admins show as "Team Member"

-- First, identify which users should be admins based on existing data
-- Get the Admin role ID
WITH admin_role AS (
  SELECT id FROM public.roles WHERE name = 'Admin' LIMIT 1
),

-- Find users who are already in user_security_profiles with System Administrator
admins_via_security AS (
  SELECT DISTINCT usp.user_id
  FROM public.user_security_profiles usp
  JOIN public.security_profiles sp ON usp.profile_id = sp.id
  WHERE sp.name = 'System Administrator'
),

-- Find users who should be admins based on existing assignments
should_be_admins AS (
  SELECT DISTINCT
    COALESCE(a.user_id, b.reporting_manager_id) as user_id
  FROM admins_via_security a
  FULL OUTER JOIN public.users b ON b.role_id = (SELECT id FROM admin_role)
  WHERE COALESCE(a.user_id, b.reporting_manager_id) IS NOT NULL
)

-- Update users table to set role_id for all admins
UPDATE public.users u
SET role_id = (SELECT id FROM admin_role)
WHERE u.id IN (SELECT user_id FROM should_be_admins)
  AND u.role_id IS NULL;

-- Ensure all users with Admin role_id are also in user_security_profiles with System Administrator
INSERT INTO public.user_security_profiles (user_id, profile_id)
SELECT u.id, sp.id
FROM public.users u
JOIN public.roles r ON u.role_id = r.id
JOIN public.security_profiles sp ON sp.name = 'System Administrator'
WHERE r.name = 'Admin'
  AND u.id NOT IN (SELECT user_id FROM public.user_security_profiles)
ON CONFLICT (user_id) DO UPDATE SET profile_id = EXCLUDED.profile_id;

-- Ensure System Administrator security profile has all necessary SBEE module permissions
DELETE FROM public.profile_object_permissions
WHERE profile_id = (SELECT id FROM public.security_profiles WHERE name = 'System Administrator')
  AND object_name LIKE 'module_%';

INSERT INTO public.profile_object_permissions (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT
  sp.id,
  obj.name,
  true, true, true, true, true, true
FROM public.security_profiles sp
CROSS JOIN (
  VALUES
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
