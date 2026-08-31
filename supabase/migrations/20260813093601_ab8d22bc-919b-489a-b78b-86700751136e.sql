-- 1. COMPANY PROFILE: remove public table access, expose branding only via a definer view
DROP POLICY IF EXISTS "Branding columns are readable" ON public.company_profile;
REVOKE ALL ON public.company_profile FROM anon, authenticated;

DROP VIEW IF EXISTS public.company_branding;
CREATE VIEW public.company_branding
WITH (security_invoker = false) AS
  SELECT id, company_name, logo_url, address, updated_at
  FROM public.company_profile;

REVOKE ALL ON public.company_branding FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_branding TO anon, authenticated;
GRANT ALL ON public.company_branding TO service_role;

-- 2. STORAGE: ownership checks on upload policies
DROP POLICY IF EXISTS "Authenticated can upload grn photos" ON storage.objects;
CREATE POLICY "Authenticated can upload grn photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'grn-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated upload invoice files" ON storage.objects;
CREATE POLICY "Authenticated upload invoice files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can upload temp downloads" ON storage.objects;
CREATE POLICY "Authenticated users can upload temp downloads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'temp-downloads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- temp downloads are uploaded with upsert:true -> allow updating only own folder
DROP POLICY IF EXISTS "Users update own temp downloads" ON storage.objects;
CREATE POLICY "Users update own temp downloads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'temp-downloads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'temp-downloads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated upload customer documents" ON storage.objects;
CREATE POLICY "Authenticated upload customer documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'customer-documents'
    AND owner = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated upload pm attachments" ON storage.objects;
CREATE POLICY "Authenticated upload pm attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pm-attachments'
    AND owner = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated upload site attachments" ON storage.objects;
CREATE POLICY "Authenticated upload site attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-attachments'
    AND owner = auth.uid()
  );

-- 3. SECURITY DEFINER FUNCTIONS: no anonymous execution
REVOKE EXECUTE ON FUNCTION public.get_company_profile_full() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_device_status(integer, boolean, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_subordinate_users(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_hierarchy(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_object(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_crm_record(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_customer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.convert_lead(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_security_management_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_monthly_leave_accruals(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_monthly_expense_summary(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_current_user(text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;

-- 4. In-function authorization for sensitive definer functions callable by signed-in users
CREATE OR REPLACE FUNCTION public.get_monthly_expense_summary(_user_id uuid, _year_month text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date;
  v_end date;
  v_cfg RECORD;
  v_ta_amount numeric := 0;
  v_ta_rate numeric := 0;
  v_ta_type text := 'from_gps';
  v_da_amount numeric := 0;
  v_da_basis text := 'per_day';
  v_manager_id uuid;
  v_group_id uuid;
  v_override numeric;
  v_ta numeric := 0;
  v_da numeric := 0;
  v_add_approved numeric := 0;
  v_add_pending numeric := 0;
  v_present_days numeric := 0;
  v_total_km numeric := 0;
  v_daily json;
  v_weekly json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h WHERE h.user_id = _user_id)
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_start := to_date(_year_month || '-01', 'YYYY-MM-DD');
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  SELECT * INTO v_cfg FROM public.expense_master_config ORDER BY updated_at DESC LIMIT 1;
  IF v_cfg.id IS NOT NULL THEN
    v_ta_type := v_cfg.ta_type;
    v_ta_amount := COALESCE(v_cfg.fixed_ta_amount, 0);
    v_ta_rate := COALESCE(v_cfg.ta_per_km_rate, 0);
    v_da_amount := COALESCE(v_cfg.fixed_da_amount, 0);
    v_da_basis := COALESCE(v_cfg.da_calculation_basis, 'per_day');
  END IF;

  SELECT reporting_manager_id INTO v_manager_id FROM public.users WHERE id = _user_id;

  SELECT amount INTO v_override FROM public.expense_overrides WHERE field='ta' AND ref_type='user' AND ref_id=_user_id;
  IF v_override IS NOT NULL THEN
    IF v_ta_type='fixed' THEN v_ta_amount := v_override; ELSE v_ta_rate := v_override; END IF;
  ELSE
    SELECT g.id INTO v_group_id FROM public.expense_groups g
      JOIN public.expense_group_members m ON m.group_id=g.id
      WHERE m.user_id=_user_id LIMIT 1;
    IF v_group_id IS NOT NULL THEN
      SELECT ta_type, fixed_ta_amount, ta_per_km_rate INTO v_ta_type, v_ta_amount, v_ta_rate
        FROM public.expense_groups WHERE id=v_group_id;
    ELSIF v_manager_id IS NOT NULL THEN
      SELECT amount INTO v_override FROM public.expense_overrides WHERE field='ta' AND ref_type='team' AND ref_id=v_manager_id;
      IF v_override IS NOT NULL THEN
        IF v_ta_type='fixed' THEN v_ta_amount := v_override; ELSE v_ta_rate := v_override; END IF;
      END IF;
    END IF;
  END IF;

  SELECT amount INTO v_override FROM public.expense_overrides WHERE field='da' AND ref_type='user' AND ref_id=_user_id;
  IF v_override IS NOT NULL THEN
    v_da_amount := v_override;
  ELSE
    IF v_group_id IS NOT NULL THEN
      SELECT da_amount INTO v_da_amount FROM public.expense_groups WHERE id=v_group_id;
    ELSIF v_manager_id IS NOT NULL THEN
      SELECT amount INTO v_override FROM public.expense_overrides WHERE field='da' AND ref_type='team' AND ref_id=v_manager_id;
      IF v_override IS NOT NULL THEN v_da_amount := v_override; END IF;
    END IF;
  END IF;

  WITH dates AS (
    SELECT generate_series(v_start, v_end, interval '1 day')::date AS d
  ),
  att AS (
    SELECT date::date AS d,
           CASE WHEN status='half_day' THEN 0.5
                WHEN status IN ('present','late','work_from_home','on_duty') THEN 1
                ELSE 0 END AS present
    FROM public.attendance WHERE user_id = _user_id AND date::date BETWEEN v_start AND v_end
  ),
  gps_pts AS (
    SELECT date::date AS d, latitude, longitude, timestamp,
           LAG(latitude) OVER (PARTITION BY date::date ORDER BY timestamp) AS prev_lat,
           LAG(longitude) OVER (PARTITION BY date::date ORDER BY timestamp) AS prev_lng
    FROM public.gps_tracking
    WHERE user_id = _user_id AND date::date BETWEEN v_start AND v_end
  ),
  gps AS (
    SELECT d,
           COALESCE(SUM(
             CASE WHEN prev_lat IS NULL THEN 0
             ELSE 6371 * 2 * asin(sqrt(
               power(sin(radians((latitude - prev_lat) / 2)), 2) +
               cos(radians(prev_lat)) * cos(radians(latitude)) *
               power(sin(radians((longitude - prev_lng) / 2)), 2)
             )) END
           ), 0) AS km
    FROM gps_pts
    GROUP BY d
  ),
  add_exp AS (
    SELECT expense_date::date AS d,
           SUM(CASE WHEN status='approved' THEN amount ELSE 0 END) AS approved,
           SUM(CASE WHEN status IN ('submitted','pending') THEN amount ELSE 0 END) AS pending,
           SUM(amount) AS total
    FROM public.additional_expenses WHERE user_id = _user_id AND expense_date BETWEEN v_start AND v_end
    GROUP BY expense_date::date
  ),
  per_day AS (
    SELECT d.d,
           COALESCE(a.present,0) AS present,
           COALESCE(g.km,0) AS km,
           COALESCE(ae.approved,0) AS add_approved,
           COALESCE(ae.pending,0) AS add_pending,
           COALESCE(ae.total,0) AS add_total,
           CASE
             WHEN v_ta_type='from_gps' THEN COALESCE(g.km,0) * v_ta_rate
             ELSE (CASE WHEN COALESCE(a.present,0) > 0 THEN v_ta_amount ELSE 0 END)
           END AS ta_val,
           CASE
             WHEN v_da_basis='per_half_day' THEN COALESCE(a.present,0) * v_da_amount
             ELSE (CASE WHEN COALESCE(a.present,0) > 0 THEN v_da_amount ELSE 0 END)
           END AS da_val
    FROM dates d
    LEFT JOIN att a ON a.d=d.d
    LEFT JOIN gps g ON g.d=d.d
    LEFT JOIN add_exp ae ON ae.d=d.d
  )
  SELECT
    COALESCE(SUM(present),0),
    COALESCE(SUM(km),0),
    COALESCE(SUM(ta_val),0),
    COALESCE(SUM(da_val),0),
    COALESCE(SUM(add_approved),0),
    COALESCE(SUM(add_pending),0),
    json_agg(json_build_object(
      'date', to_char(d,'YYYY-MM-DD'),
      'present', present,
      'km', km,
      'ta', ta_val,
      'da', da_val,
      'additional', add_total
    ) ORDER BY d)
  INTO v_present_days, v_total_km, v_ta, v_da, v_add_approved, v_add_pending, v_daily
  FROM per_day;

  WITH per_day AS (
    SELECT d.d,
           COALESCE(a.present,0) AS present,
           COALESCE(g.km,0) AS km,
           COALESCE(ae.total,0) AS add_total,
           CASE
             WHEN v_ta_type='from_gps' THEN COALESCE(g.km,0) * v_ta_rate
             ELSE (CASE WHEN COALESCE(a.present,0) > 0 THEN v_ta_amount ELSE 0 END)
           END AS ta_val,
           CASE
             WHEN v_da_basis='per_half_day' THEN COALESCE(a.present,0) * v_da_amount
             ELSE (CASE WHEN COALESCE(a.present,0) > 0 THEN v_da_amount ELSE 0 END)
           END AS da_val
    FROM (SELECT generate_series(v_start, v_end, interval '1 day')::date AS d) d
    LEFT JOIN (
      SELECT date::date AS d,
             CASE WHEN status='half_day' THEN 0.5
                  WHEN status IN ('present','late','work_from_home','on_duty') THEN 1
                  ELSE 0 END AS present
      FROM public.attendance WHERE user_id = _user_id AND date::date BETWEEN v_start AND v_end
    ) a ON a.d=d.d
    LEFT JOIN (
      SELECT date::date AS d,
             COALESCE(SUM(
               CASE WHEN prev_lat IS NULL THEN 0
               ELSE 6371 * 2 * asin(sqrt(
                 power(sin(radians((latitude - prev_lat) / 2)), 2) +
                 cos(radians(prev_lat)) * cos(radians(latitude)) *
                 power(sin(radians((longitude - prev_lng) / 2)), 2)
               )) END
             ), 0) AS km
      FROM (
        SELECT date, latitude, longitude, timestamp,
               LAG(latitude) OVER (PARTITION BY date::date ORDER BY timestamp) AS prev_lat,
               LAG(longitude) OVER (PARTITION BY date::date ORDER BY timestamp) AS prev_lng
        FROM public.gps_tracking
        WHERE user_id = _user_id AND date::date BETWEEN v_start AND v_end
      ) x
      GROUP BY date::date
    ) g ON g.d=d.d
    LEFT JOIN (
      SELECT expense_date::date AS d, SUM(amount) AS total
      FROM public.additional_expenses WHERE user_id = _user_id AND expense_date BETWEEN v_start AND v_end
      GROUP BY expense_date::date
    ) ae ON ae.d=d.d
  )
  SELECT json_agg(row_to_json(x) ORDER BY x.week_start)
  INTO v_weekly
  FROM (
    SELECT date_trunc('week', d)::date AS week_start,
           SUM(ta_val) AS ta,
           SUM(da_val) AS da,
           SUM(add_total) AS additional
    FROM per_day GROUP BY 1
  ) x;

  RETURN json_build_object(
    'ta', v_ta,
    'da', v_da,
    'additional_approved', v_add_approved,
    'additional_pending', v_add_pending,
    'total', v_ta + v_da + v_add_approved,
    'present_days', v_present_days,
    'total_km', v_total_km,
    'daily', COALESCE(v_daily, '[]'::json),
    'weekly', COALESCE(v_weekly, '[]'::json)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_notification(user_id_param uuid, title_param text, message_param text, type_param text DEFAULT 'info'::text, related_table_param text DEFAULT NULL::text, related_id_param uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  notification_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF user_id_param IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h WHERE h.user_id = user_id_param)
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.reporting_manager_id = user_id_param)
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, related_table, related_id)
  VALUES (user_id_param, title_param, message_param, type_param, related_table_param, related_id_param)
  RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_monthly_leave_accruals(_target_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user RECORD;
  v_lt RECORD;
  v_doj DATE;
  v_now DATE := CURRENT_DATE;
  v_current_year INT := EXTRACT(YEAR FROM v_now)::INT;
  v_current_month INT := EXTRACT(MONTH FROM v_now)::INT;
  v_start_month INT;
  v_monthly_alloc NUMERIC;
  v_prev_remaining NUMERIC;
  v_month_used NUMERIC;
  v_m INT;
  v_total_allocated NUMERIC;
  v_total_used NUMERIC;
BEGIN
  -- Callers must be admins, the target user themselves, or the backend cron (service_role)
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND (_target_user_id IS NULL OR _target_user_id IS DISTINCT FROM auth.uid())
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_user IN
    SELECT u.id AS user_id
    FROM public.users u
    WHERE u.is_active = true
      AND (_target_user_id IS NULL OR u.id = _target_user_id)
  LOOP
    SELECT e.date_of_joining INTO v_doj
    FROM public.employees e WHERE e.user_id = v_user.user_id;

    FOR v_lt IN
      SELECT id, annual_quota FROM public.leave_types WHERE is_active = true
    LOOP
      v_monthly_alloc := FLOOR(v_lt.annual_quota::NUMERIC / 12);

      IF v_doj IS NOT NULL AND EXTRACT(YEAR FROM v_doj) = v_current_year THEN
        v_start_month := EXTRACT(MONTH FROM v_doj)::INT;
      ELSIF v_doj IS NOT NULL AND EXTRACT(YEAR FROM v_doj) > v_current_year THEN
        CONTINUE;
      ELSE
        v_start_month := 1;
      END IF;

      v_prev_remaining := 0;
      v_total_allocated := 0;
      v_total_used := 0;

      FOR v_m IN v_start_month..v_current_month LOOP
        SELECT COALESCE(SUM(
          CASE
            WHEN la.from_date >= make_date(v_current_year, v_m, 1)
                 AND la.to_date < (make_date(v_current_year, v_m, 1) + interval '1 month')::date
            THEN la.total_days
            ELSE
              GREATEST(0,
                (LEAST(la.to_date, (make_date(v_current_year, v_m, 1) + interval '1 month' - interval '1 day')::date)
                 - GREATEST(la.from_date, make_date(v_current_year, v_m, 1)) + 1)::NUMERIC
              )
          END
        ), 0) INTO v_month_used
        FROM public.leave_applications la
        WHERE la.user_id = v_user.user_id
          AND la.leave_type_id = v_lt.id
          AND la.status = 'approved'
          AND la.from_date <= (make_date(v_current_year, v_m, 1) + interval '1 month' - interval '1 day')::date
          AND la.to_date >= make_date(v_current_year, v_m, 1);

        INSERT INTO public.monthly_leave_accrual (user_id, leave_type_id, year, month, allocated, carried_forward, used)
        VALUES (v_user.user_id, v_lt.id, v_current_year, v_m, v_monthly_alloc, v_prev_remaining, v_month_used)
        ON CONFLICT (user_id, leave_type_id, year, month) DO UPDATE
        SET allocated = EXCLUDED.allocated,
            carried_forward = EXCLUDED.carried_forward,
            used = EXCLUDED.used,
            updated_at = now();

        v_total_allocated := v_total_allocated + v_monthly_alloc;
        v_total_used := v_total_used + v_month_used;
        v_prev_remaining := v_prev_remaining + v_monthly_alloc - v_month_used;
      END LOOP;

      INSERT INTO public.leave_balance (user_id, leave_type_id, year, opening_balance, used_balance)
      VALUES (v_user.user_id, v_lt.id, v_current_year, v_total_allocated::INT, v_total_used::INT)
      ON CONFLICT (user_id, leave_type_id, year) DO UPDATE
      SET opening_balance = EXCLUDED.opening_balance,
          used_balance = EXCLUDED.used_balance,
          updated_at = now();
    END LOOP;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_monthly_leave_accruals(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_monthly_expense_summary(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_monthly_leave_accruals(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_monthly_expense_summary(uuid, text) TO authenticated, service_role;