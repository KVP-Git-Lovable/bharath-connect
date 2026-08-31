CREATE OR REPLACE FUNCTION public.compute_filtered_distance_km(_user_id uuid, _date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  MAX_ACCURACY_METERS constant numeric := 150;
  MIN_MOVE_METERS_FLOOR constant numeric := 10;
  MAX_SPEED_KMH constant numeric := 160;
  MAX_TIME_GAP_MINUTES constant numeric := 5;
  PING_PONG_OUTLIER_M constant numeric := 300;
  PING_PONG_RETURN_M constant numeric := 150;

  r RECORD;
  cleaned jsonb := '[]'::jsonb;
  prev jsonb;
  dist_m numeric;
  required_m numeric;
  gap_min numeric;
  speed_kmh numeric;

  deduped jsonb := '[]'::jsonb;
  i int;
  n int;
  curr jsonb;
  nxt jsonb;
  out_m numeric;
  back_m numeric;
  span_m numeric;

  total_m numeric := 0;
BEGIN
  -- Pass 1: accuracy gate + Pass 2: stateful sequential filter
  FOR r IN
    SELECT latitude::numeric AS lat, longitude::numeric AS lng,
           accuracy::numeric AS acc, timestamp AS ts
    FROM public.gps_tracking
    WHERE user_id = _user_id
      AND date::date = _date
      AND accuracy IS NOT NULL
      AND accuracy <= MAX_ACCURACY_METERS
    ORDER BY timestamp ASC
  LOOP
    IF jsonb_array_length(cleaned) = 0 THEN
      cleaned := cleaned || jsonb_build_object('lat', r.lat, 'lng', r.lng, 'acc', r.acc, 'ts', r.ts);
      CONTINUE;
    END IF;

    prev := cleaned -> (jsonb_array_length(cleaned) - 1);

    dist_m := 6371000 * 2 * asin(sqrt(
      power(sin(radians((r.lat - (prev->>'lat')::numeric) / 2)), 2) +
      cos(radians((prev->>'lat')::numeric)) * cos(radians(r.lat)) *
      power(sin(radians((r.lng - (prev->>'lng')::numeric) / 2)), 2)
    ));

    required_m := GREATEST(MIN_MOVE_METERS_FLOOR,
      COALESCE((prev->>'acc')::numeric, MAX_ACCURACY_METERS) + COALESCE(r.acc, MAX_ACCURACY_METERS));

    IF dist_m < required_m THEN
      CONTINUE; -- stationary jitter, do not advance anchor
    END IF;

    gap_min := EXTRACT(EPOCH FROM (r.ts - (prev->>'ts')::timestamptz)) / 60.0;

    IF gap_min > MAX_TIME_GAP_MINUTES THEN
      cleaned := cleaned || jsonb_build_object('lat', r.lat, 'lng', r.lng, 'acc', r.acc, 'ts', r.ts);
      CONTINUE;
    END IF;

    speed_kmh := CASE WHEN gap_min > 0 THEN (dist_m / 1000.0) / (gap_min / 60.0) ELSE 0 END;

    IF speed_kmh <= MAX_SPEED_KMH THEN
      cleaned := cleaned || jsonb_build_object('lat', r.lat, 'lng', r.lng, 'acc', r.acc, 'ts', r.ts);
    END IF;
  END LOOP;

  -- Pass 3: ping-pong outlier removal
  n := jsonb_array_length(cleaned);
  i := 0;
  WHILE i < n LOOP
    curr := cleaned -> i;
    prev := CASE WHEN jsonb_array_length(deduped) > 0
                 THEN deduped -> (jsonb_array_length(deduped) - 1) ELSE NULL END;
    nxt := CASE WHEN i + 1 < n THEN cleaned -> (i + 1) ELSE NULL END;

    IF prev IS NOT NULL AND nxt IS NOT NULL THEN
      out_m := 6371000 * 2 * asin(sqrt(
        power(sin(radians(((curr->>'lat')::numeric - (prev->>'lat')::numeric) / 2)), 2) +
        cos(radians((prev->>'lat')::numeric)) * cos(radians((curr->>'lat')::numeric)) *
        power(sin(radians(((curr->>'lng')::numeric - (prev->>'lng')::numeric) / 2)), 2)
      ));
      back_m := 6371000 * 2 * asin(sqrt(
        power(sin(radians(((nxt->>'lat')::numeric - (curr->>'lat')::numeric) / 2)), 2) +
        cos(radians((curr->>'lat')::numeric)) * cos(radians((nxt->>'lat')::numeric)) *
        power(sin(radians(((nxt->>'lng')::numeric - (curr->>'lng')::numeric) / 2)), 2)
      ));
      span_m := 6371000 * 2 * asin(sqrt(
        power(sin(radians(((nxt->>'lat')::numeric - (prev->>'lat')::numeric) / 2)), 2) +
        cos(radians((prev->>'lat')::numeric)) * cos(radians((nxt->>'lat')::numeric)) *
        power(sin(radians(((nxt->>'lng')::numeric - (prev->>'lng')::numeric) / 2)), 2)
      ));
      IF out_m >= PING_PONG_OUTLIER_M AND back_m >= PING_PONG_OUTLIER_M AND span_m <= PING_PONG_RETURN_M THEN
        i := i + 1;
        CONTINUE;
      END IF;
    END IF;

    deduped := deduped || curr;
    i := i + 1;
  END LOOP;

  -- Distance sum
  n := jsonb_array_length(deduped);
  i := 1;
  WHILE i < n LOOP
    prev := deduped -> (i - 1);
    curr := deduped -> i;
    total_m := total_m + 6371000 * 2 * asin(sqrt(
      power(sin(radians(((curr->>'lat')::numeric - (prev->>'lat')::numeric) / 2)), 2) +
      cos(radians((prev->>'lat')::numeric)) * cos(radians((curr->>'lat')::numeric)) *
      power(sin(radians(((curr->>'lng')::numeric - (prev->>'lng')::numeric) / 2)), 2)
    ));
    i := i + 1;
  END LOOP;

  RETURN ROUND(total_m / 1000.0, 4);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.compute_filtered_distance_km(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_filtered_distance_km(uuid, date) TO authenticated, service_role;

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
                ELSE 0 END AS present,
           total_distance_km
    FROM public.attendance WHERE user_id = _user_id AND date::date BETWEEN v_start AND v_end
  ),
  gps_days AS (
    SELECT DISTINCT date::date AS d
    FROM public.gps_tracking
    WHERE user_id = _user_id AND date::date BETWEEN v_start AND v_end
  ),
  gps AS (
    SELECT gd.d,
           COALESCE(a.total_distance_km, public.compute_filtered_distance_km(_user_id, gd.d)) AS km
    FROM gps_days gd
    LEFT JOIN att a ON a.d = gd.d
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
           COALESCE(g.km, a.total_distance_km, 0) AS km,
           COALESCE(ae.approved,0) AS add_approved,
           COALESCE(ae.pending,0) AS add_pending,
           COALESCE(ae.total,0) AS add_total,
           CASE
             WHEN v_ta_type='from_gps' THEN COALESCE(g.km, a.total_distance_km, 0) * v_ta_rate
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

  WITH att AS (
    SELECT date::date AS d,
           CASE WHEN status='half_day' THEN 0.5
                WHEN status IN ('present','late','work_from_home','on_duty') THEN 1
                ELSE 0 END AS present,
           total_distance_km
    FROM public.attendance WHERE user_id = _user_id AND date::date BETWEEN v_start AND v_end
  ),
  gps_days AS (
    SELECT DISTINCT date::date AS d
    FROM public.gps_tracking
    WHERE user_id = _user_id AND date::date BETWEEN v_start AND v_end
  ),
  gps AS (
    SELECT gd.d,
           COALESCE(a.total_distance_km, public.compute_filtered_distance_km(_user_id, gd.d)) AS km
    FROM gps_days gd
    LEFT JOIN att a ON a.d = gd.d
  ),
  per_day AS (
    SELECT d.d,
           COALESCE(a.present,0) AS present,
           COALESCE(g.km, a.total_distance_km, 0) AS km,
           COALESCE(ae.total,0) AS add_total,
           CASE
             WHEN v_ta_type='from_gps' THEN COALESCE(g.km, a.total_distance_km, 0) * v_ta_rate
             ELSE (CASE WHEN COALESCE(a.present,0) > 0 THEN v_ta_amount ELSE 0 END)
           END AS ta_val,
           CASE
             WHEN v_da_basis='per_half_day' THEN COALESCE(a.present,0) * v_da_amount
             ELSE (CASE WHEN COALESCE(a.present,0) > 0 THEN v_da_amount ELSE 0 END)
           END AS da_val
    FROM (SELECT generate_series(v_start, v_end, interval '1 day')::date AS d) d
    LEFT JOIN att a ON a.d=d.d
    LEFT JOIN gps g ON g.d=d.d
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

REVOKE EXECUTE ON FUNCTION public.get_monthly_expense_summary(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_expense_summary(uuid, text) TO authenticated, service_role;