
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
