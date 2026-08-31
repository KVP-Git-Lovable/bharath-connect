-- Create app users table linked to authenticated users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure case-insensitive email uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx
  ON public.users (lower(email));

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read/update themselves, admins can manage all
DROP POLICY IF EXISTS "Users can view own app user" ON public.users;
CREATE POLICY "Users can view own app user"
ON public.users
FOR SELECT
USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own app user" ON public.users;
CREATE POLICY "Users can update own app user"
ON public.users
FOR UPDATE
USING (id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all app users" ON public.users;
CREATE POLICY "Admins can manage all app users"
ON public.users
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Bootstraps users/profile/role from authenticated session email
CREATE OR REPLACE FUNCTION public.ensure_current_user(
  _email TEXT,
  _full_name TEXT DEFAULT NULL,
  _username TEXT DEFAULT NULL
)
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  full_name TEXT,
  username TEXT,
  role public.app_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT := lower(trim(coalesce(_email, '')));
  v_full_name TEXT := nullif(trim(coalesce(_full_name, '')), '');
  v_username TEXT := nullif(trim(coalesce(_username, '')), '');
  v_existing_role public.app_role;
  v_role_count BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  INSERT INTO public.users (id, email, full_name, username)
  VALUES (v_uid, v_email, v_full_name, COALESCE(v_username, v_email))
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    username = COALESCE(EXCLUDED.username, public.users.username),
    updated_at = now();

  INSERT INTO public.profiles (id, username, full_name)
  VALUES (v_uid, COALESCE(v_username, v_email), v_full_name)
  ON CONFLICT (id) DO UPDATE
  SET
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    updated_at = now();

  SELECT role INTO v_existing_role
  FROM public.user_roles
  WHERE user_id = v_uid
  ORDER BY assigned_at ASC
  LIMIT 1;

  IF v_existing_role IS NULL THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.ensure_current_user(TEXT, TEXT, TEXT) TO authenticated;