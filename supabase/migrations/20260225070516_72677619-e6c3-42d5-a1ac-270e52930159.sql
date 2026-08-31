
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

  -- Check if user already has a role_id set (qualify with table alias)
  SELECT u.role_id INTO v_role_id FROM public.users u WHERE u.id = v_uid;

  -- If no role_id, determine one
  IF v_role_id IS NULL THEN
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

    SELECT r.id INTO v_role_id FROM public.roles r
    WHERE r.name = CASE v_existing_role
      WHEN 'admin' THEN 'Admin'
      WHEN 'user' THEN 'Field User'
      WHEN 'sales_manager' THEN 'Sales Manager'
      WHEN 'data_viewer' THEN 'Data Viewer'
    END;
  END IF;

  INSERT INTO public.users AS usr (id, email, full_name, username, role_id)
  VALUES (v_uid, v_email, v_full_name, COALESCE(v_username, v_email), v_role_id)
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, usr.full_name),
    username = COALESCE(EXCLUDED.username, usr.username),
    role_id = COALESCE(usr.role_id, EXCLUDED.role_id),
    updated_at = now();

  INSERT INTO public.profiles AS prf (id, username, full_name)
  VALUES (v_uid, COALESCE(v_username, v_email), v_full_name)
  ON CONFLICT (id) DO UPDATE
  SET
    username = COALESCE(EXCLUDED.username, prf.username),
    full_name = COALESCE(EXCLUDED.full_name, prf.full_name),
    updated_at = now();

  -- Keep user_roles in sync (qualify all user_id refs with table alias)
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id = v_uid) THEN
    SELECT COUNT(*) INTO v_role_count FROM public.user_roles;
    v_existing_role := CASE WHEN v_role_count = 0 THEN 'admin'::public.app_role ELSE 'user'::public.app_role END;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, v_existing_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email,
    u.full_name,
    u.username,
    COALESCE(
      (SELECT ur3.role FROM public.user_roles ur3 WHERE ur3.user_id = u.id ORDER BY ur3.assigned_at ASC LIMIT 1),
      'user'::public.app_role
    ) AS role
  FROM public.users u
  WHERE u.id = v_uid
  LIMIT 1;
END;
$function$;
