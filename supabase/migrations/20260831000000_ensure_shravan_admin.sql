-- Ensure Shravan is assigned as System Administrator with full module access
-- (same pattern as 20260806000000_ensure_ajay_admin.sql, plus module_expenses)

-- 1) Set Shravan's role to Admin (drives the "Admin" badge and isAdmin checks)
UPDATE public.users
SET role_id = (
  SELECT id FROM public.roles
  WHERE lower(name) IN ('admin', 'administrator')
  LIMIT 1
)
WHERE full_name ILIKE '%shravan%' OR email ILIKE '%shravan%';

-- 2) Replace any existing (limited) security-profile assignment with the admin profile.
--    The app reads exactly one assignment per user (maybeSingle), so remove old rows first.
DELETE FROM public.user_security_profiles
WHERE user_id IN (
  SELECT id FROM public.users
  WHERE full_name ILIKE '%shravan%' OR email ILIKE '%shravan%'
);

INSERT INTO public.user_security_profiles (user_id, profile_id)
SELECT u.id, sp.id
FROM public.users u
CROSS JOIN LATERAL (
  SELECT id FROM public.security_profiles
  WHERE lower(name) IN ('system administrator', 'administrator')
  ORDER BY CASE lower(name) WHEN 'system administrator' THEN 0 ELSE 1 END
  LIMIT 1
) sp
WHERE u.full_name ILIKE '%shravan%' OR u.email ILIKE '%shravan%'
ON CONFLICT (user_id, profile_id) DO NOTHING;

-- 3) Ensure the admin profile has every module permission (including GPS Track,
--    Expenses, and the Admin panel)
INSERT INTO public.profile_object_permissions
  (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, obj.name, true, true, true, true, true, true
FROM public.security_profiles sp
CROSS JOIN (VALUES
  ('module_attendance'),
  ('module_gps_tracking'),
  ('module_activities'),
  ('module_sites'),
  ('module_my_team'),
  ('module_procurement'),
  ('module_expenses'),
  ('module_customers'),
  ('module_opportunities'),
  ('module_leads'),
  ('module_events'),
  ('module_reports'),
  ('module_admin_panel')
) AS obj(name)
WHERE lower(sp.name) IN ('system administrator', 'administrator')
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_object_permissions pop
    WHERE pop.profile_id = sp.id AND pop.object_name = obj.name
  );

-- 4) If any of those module rows already existed but with flags off, switch them on
UPDATE public.profile_object_permissions pop
SET can_read = true, can_create = true, can_edit = true,
    can_delete = true, can_view_all = true, can_modify_all = true
FROM public.security_profiles sp
WHERE pop.profile_id = sp.id
  AND lower(sp.name) IN ('system administrator', 'administrator')
  AND pop.object_name LIKE 'module\_%';
