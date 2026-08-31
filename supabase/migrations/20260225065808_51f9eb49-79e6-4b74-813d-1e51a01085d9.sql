
-- 1. Create roles table
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage roles" ON public.roles FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view roles" ON public.roles FOR SELECT
  USING (true);

-- Seed default roles
INSERT INTO public.roles (name, is_system) VALUES
  ('Admin', true),
  ('Field User', true),
  ('Sales Manager', true),
  ('Data Viewer', true);

-- 2. Add new columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id),
  ADD COLUMN IF NOT EXISTS reporting_manager_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 3. Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_name text NOT NULL,
  can_read boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_view_all boolean NOT NULL DEFAULT false,
  can_modify_all boolean NOT NULL DEFAULT false
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage permissions" ON public.permissions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view permissions" ON public.permissions FOR SELECT
  USING (true);

-- 4. Create role_permissions junction table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage role_permissions" ON public.role_permissions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view role_permissions" ON public.role_permissions FOR SELECT
  USING (true);

-- 5. Migrate existing data: map user_roles → roles → users.role_id
UPDATE public.users u
SET role_id = r.id
FROM public.user_roles ur
JOIN public.roles r ON (
  CASE ur.role
    WHEN 'admin' THEN 'Admin'
    WHEN 'user' THEN 'Field User'
    WHEN 'sales_manager' THEN 'Sales Manager'
    WHEN 'data_viewer' THEN 'Data Viewer'
  END = r.name
)
WHERE ur.user_id = u.id;

-- Migrate manager_id from employees
UPDATE public.users u
SET reporting_manager_id = e.manager_id
FROM public.employees e
WHERE e.user_id = u.id AND e.manager_id IS NOT NULL;

-- Migrate phone from profiles
UPDATE public.users u
SET phone = p.phone_number
FROM public.profiles p
WHERE p.id = u.id AND p.phone_number IS NOT NULL;

-- Migrate is_active from profiles.user_status
UPDATE public.users u
SET is_active = (p.user_status = 'active')
FROM public.profiles p
WHERE p.id = u.id;

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_reporting_manager_id ON public.users(reporting_manager_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions(permission_id);

-- 7. Create recursive hierarchy function using new structure
CREATE OR REPLACE FUNCTION public.get_user_hierarchy(_manager_id uuid)
RETURNS TABLE(user_id uuid, level integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE subordinates AS (
    SELECT u.id AS user_id, 1 AS level
    FROM public.users u
    WHERE u.reporting_manager_id = _manager_id AND u.is_active = true
    UNION ALL
    SELECT u.id, s.level + 1
    FROM public.users u
    INNER JOIN subordinates s ON u.reporting_manager_id = s.user_id
    WHERE s.level < 10 AND u.is_active = true
  )
  SELECT * FROM subordinates
$$;

-- 8. Update ensure_current_user to set role_id on users table
CREATE OR REPLACE FUNCTION public.ensure_current_user(_email text, _full_name text DEFAULT NULL::text, _username text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, email text, full_name text, username text, role app_role)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT := lower(trim(coalesce(_email, '')));
  v_full_name TEXT := nullif(trim(coalesce(_full_name, '')), '');
  v_username TEXT := nullif(trim(coalesce(_username, '')), '');
  v_existing_role public.app_role;
  v_role_count BIGINT;
  v_role_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  -- Check if user already has a role_id set
  SELECT u.role_id INTO v_role_id FROM public.users u WHERE u.id = v_uid;

  -- If no role_id, determine one
  IF v_role_id IS NULL THEN
    -- Check user_roles table for backward compat
    SELECT ur.role INTO v_existing_role
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
    ORDER BY ur.assigned_at ASC
    LIMIT 1;

    IF v_existing_role IS NULL THEN
      SELECT COUNT(*) INTO v_role_count FROM public.user_roles;
      v_existing_role := CASE WHEN v_role_count = 0 THEN 'admin'::public.app_role ELSE 'user'::public.app_role END;

      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_uid, v_existing_role)
      ON CONFLICT DO NOTHING;
    END IF;

    -- Map to roles table
    SELECT r.id INTO v_role_id FROM public.roles r
    WHERE r.name = CASE v_existing_role
      WHEN 'admin' THEN 'Admin'
      WHEN 'user' THEN 'Field User'
      WHEN 'sales_manager' THEN 'Sales Manager'
      WHEN 'data_viewer' THEN 'Data Viewer'
    END;
  END IF;

  INSERT INTO public.users (id, email, full_name, username, role_id)
  VALUES (v_uid, v_email, v_full_name, COALESCE(v_username, v_email), v_role_id)
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    username = COALESCE(EXCLUDED.username, public.users.username),
    role_id = COALESCE(public.users.role_id, EXCLUDED.role_id),
    updated_at = now();

  INSERT INTO public.profiles (id, username, full_name)
  VALUES (v_uid, COALESCE(v_username, v_email), v_full_name)
  ON CONFLICT (id) DO UPDATE
  SET
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    updated_at = now();

  -- Keep user_roles in sync for backward compat with RLS
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid) THEN
    SELECT COUNT(*) INTO v_role_count FROM public.user_roles;
    v_existing_role := CASE WHEN v_role_count = 0 THEN 'admin'::public.app_role ELSE 'user'::public.app_role END;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, v_existing_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.full_name,
    u.username,
    COALESCE(
      (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = u.id ORDER BY ur.assigned_at ASC LIMIT 1),
      'user'::public.app_role
    ) AS role
  FROM public.users u
  WHERE u.id = v_uid
  LIMIT 1;
END;
$function$;

-- 9. Add updated_at trigger for roles table
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
