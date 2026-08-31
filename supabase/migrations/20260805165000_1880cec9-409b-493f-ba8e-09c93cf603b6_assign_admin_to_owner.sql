-- Ensure the app owner/admin users have Admin role assigned
-- This fixes the issue where Suyog and other admins show as "Team Member"

-- Get the Admin role ID
WITH admin_role AS (
  SELECT id FROM public.roles WHERE name = 'Admin' LIMIT 1
),

-- Get the System Administrator security profile ID
system_admin_profile AS (
  SELECT id FROM public.security_profiles WHERE name = 'System Administrator' LIMIT 1
)

-- Update users who should be admins:
-- 1. Users with email containing "suyog" (owner)
-- 2. Users listed as managers of other users (likely admins)
-- 3. Users with no role_id set but should be admin based on other criteria

UPDATE public.users u
SET role_id = (SELECT id FROM admin_role)
WHERE (
  -- Match Suyog (owner)
  email ILIKE '%suyog%'
  OR email ILIKE 'suyog%'
  OR full_name ILIKE '%suyog%'
)
AND role_id IS NULL;

-- Also ensure these users have security profile assignments
INSERT INTO public.user_security_profiles (user_id, profile_id)
SELECT u.id, sp.id
FROM public.users u
CROSS JOIN system_admin_profile sp
WHERE (
  email ILIKE '%suyog%'
  OR email ILIKE 'suyog%'
  OR full_name ILIKE '%suyog%'
)
AND u.id NOT IN (SELECT user_id FROM public.user_security_profiles)
ON CONFLICT (user_id) DO UPDATE SET profile_id = EXCLUDED.profile_id;
