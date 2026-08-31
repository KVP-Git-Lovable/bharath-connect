-- Systemic fix: make the security profile the single source of truth for admin
-- access, instead of per-user rows in three separate systems (user_roles,
-- users.role_id, security profiles).
--
-- 1. has_role(uid,'admin') now also returns true for anyone holding an
--    admin-named security profile — this makes every RLS policy that calls
--    has_role() work for all current AND future admin-profile users.
-- 2. A trigger on user_security_profiles keeps user_roles and users.role_id
--    in sync automatically whenever a profile is assigned or removed.
-- 3. Backfill existing users so everyone currently holding an admin profile
--    gets the same treatment immediately.

-- ===== 1) has_role: admin-profile holders count as admin =====
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
  OR (
    _role = 'admin'::public.app_role
    AND EXISTS (
      SELECT 1
      FROM public.user_security_profiles usp
      JOIN public.security_profiles sp ON sp.id = usp.profile_id
      WHERE usp.user_id = _user_id
        AND lower(sp.name) IN ('system administrator', 'administrator')
    )
  )
$$;

-- ===== 2) Keep user_roles + users.role_id in sync with profile assignment =====
CREATE OR REPLACE FUNCTION public.sync_admin_grants_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := COALESCE(NEW.user_id, OLD.user_id);
  v_admin_role_id uuid;
  v_is_admin boolean;
BEGIN
  SELECT id INTO v_admin_role_id
  FROM public.roles WHERE lower(name) IN ('admin', 'administrator') LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_security_profiles usp
    JOIN public.security_profiles sp ON sp.id = usp.profile_id
    WHERE usp.user_id = v_user
      AND lower(sp.name) IN ('system administrator', 'administrator')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT v_user, 'admin'::public.app_role
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_user AND role = 'admin'::public.app_role
    );
    IF v_admin_role_id IS NOT NULL THEN
      UPDATE public.users SET role_id = v_admin_role_id
      WHERE id = v_user AND role_id IS DISTINCT FROM v_admin_role_id;
    END IF;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = v_user AND role = 'admin'::public.app_role;
    IF v_admin_role_id IS NOT NULL THEN
      UPDATE public.users SET role_id = NULL
      WHERE id = v_user AND role_id = v_admin_role_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_admin_grants ON public.user_security_profiles;
CREATE TRIGGER trg_sync_admin_grants
AFTER INSERT OR UPDATE OR DELETE ON public.user_security_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_grants_from_profile();

-- ===== 3) Backfill all existing admin-profile holders =====
INSERT INTO public.user_roles (user_id, role)
SELECT usp.user_id, 'admin'::public.app_role
FROM public.user_security_profiles usp
JOIN public.security_profiles sp ON sp.id = usp.profile_id
WHERE lower(sp.name) IN ('system administrator', 'administrator')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = usp.user_id AND ur.role = 'admin'::public.app_role
  );

UPDATE public.users u
SET role_id = (SELECT id FROM public.roles WHERE lower(name) IN ('admin','administrator') LIMIT 1)
WHERE EXISTS (
  SELECT 1
  FROM public.user_security_profiles usp
  JOIN public.security_profiles sp ON sp.id = usp.profile_id
  WHERE usp.user_id = u.id
    AND lower(sp.name) IN ('system administrator', 'administrator')
);

-- ===== 4) Admin profile can manage users/security via can_access_object =====
INSERT INTO public.profile_object_permissions
  (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, obj.name, true, true, true, true, true, true
FROM public.security_profiles sp
CROSS JOIN (VALUES ('users'), ('security')) AS obj(name)
WHERE lower(sp.name) IN ('system administrator', 'administrator')
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_object_permissions pop
    WHERE pop.profile_id = sp.id AND pop.object_name = obj.name
  );
