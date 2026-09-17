-- Travel Allowance (single policy card):
ALTER TABLE public.expense_groups
  ADD COLUMN IF NOT EXISTS role_ids uuid[] NOT NULL DEFAULT '{}';

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
  v_role_group_id uuid;
  v_da_group_id uuid;
  v_role_rate_applied boolean := false;
  v_override numeric;
  v_ta_override_applied boolean := false;
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
    v_ta_override_applied := true;
  ELSE
    SELECT g.id INTO v_group_id FROM public.expense_groups g
      JOIN public.expense_group_members m ON m.group_id=g.id
      WHERE m.user_id=_user_id
        AND (COALESCE(g.fixed_ta_amount,0) > 0 OR COALESCE(g.ta_per_km_rate,0) > 0)
      ORDER BY g.created_at LIMIT 1;
    IF v_group_id IS NOT NULL THEN
      SELECT ta_type, fixed_ta_amount, ta_per_km_rate INTO v_ta_type, v_ta_amount, v_ta_rate
        FROM public.expense_groups WHERE id=v_group_id;
      v_ta_override_applied := true;
    ELSE
      IF v_manager_id IS NOT NULL THEN
        SELECT amount INTO v_override FROM public.expense_overrides WHERE field='ta' AND ref_type='team' AND ref_id=v_manager_id;
        IF v_override IS NOT NULL THEN
          IF v_ta_type='fixed' THEN v_ta_amount := v_override; ELSE v_ta_rate := v_override; END IF;
          v_ta_override_applied := true;
        END IF;
      END IF;
      -- Role-based TA row (expense_groups.role_ids). TA only; the global method still applies.
      IF NOT v_ta_override_applied THEN
        SELECT g.id INTO v_role_group_id FROM public.expense_groups g
          JOIN public.user_security_profiles usp ON usp.profile_id = ANY(g.role_ids)
          WHERE usp.user_id = _user_id
          ORDER BY g.created_at LIMIT 1;
        IF v_role_group_id IS NOT NULL THEN
          SELECT COALESCE(fixed_ta_amount,0), COALESCE(ta_per_km_rate,0) INTO v_ta_amount, v_ta_rate
            FROM public.expense_groups WHERE id = v_role_group_id;
          v_role_rate_applied := true;
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT amount INTO v_override FROM public.expense_overrides WHERE field='da' AND ref_type='user' AND ref_id=_user_id;
  IF v_override IS NOT NULL THEN
    v_da_amount := v_override;
  ELSE
    -- DA uses its own group (groups with a DA amount), so TA-only rows never zero a member's DA.
    SELECT g.id INTO v_da_group_id FROM public.expense_groups g
      JOIN public.expense_group_members m ON m.group_id=g.id
      WHERE m.user_id=_user_id AND COALESCE(g.da_amount,0) > 0
      ORDER BY g.created_at LIMIT 1;
    IF v_da_group_id IS NOT NULL THEN
      SELECT da_amount INTO v_da_amount FROM public.expense_groups WHERE id=v_da_group_id;
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
  rate_hist AS (
    SELECT d.d,
           COALESCE(
             (SELECT rh.per_km_rate FROM public.ta_rate_history rh
              WHERE rh.effective_from <= d.d AND (rh.effective_to IS NULL OR rh.effective_to >= d.d)
              ORDER BY rh.effective_from DESC LIMIT 1),
             v_ta_rate
           ) AS rate
    FROM dates d
  ),
  veh_sel AS (
    SELECT dvs.activity_date AS d, dvs.vehicle_type_id, COALESCE(vt.is_no_vehicle, false) AS is_no_vehicle,
           COALESCE(vt.fixed_ta_amount, 0) AS fixed_ta_amount
    FROM public.daily_vehicle_selections dvs
    LEFT JOIN public.vehicle_types vt ON vt.id = dvs.vehicle_type_id
    WHERE dvs.user_id = _user_id AND dvs.activity_date BETWEEN v_start AND v_end
  ),
  per_day AS (
    SELECT d.d,
           COALESCE(a.present,0) AS present,
           COALESCE(g.km, a.total_distance_km, 0) AS km,
           COALESCE(ae.approved,0) AS add_approved,
           COALESCE(ae.pending,0) AS add_pending,
           COALESCE(ae.total,0) AS add_total,
           CASE
             WHEN vs.vehicle_type_id IS NOT NULL AND vs.is_no_vehicle THEN 0
             WHEN v_ta_type='from_gps' THEN
               COALESCE(g.km, a.total_distance_km, 0) *
               CASE
                 WHEN vs.vehicle_type_id IS NOT NULL THEN
                   COALESCE(
                     (SELECT vuo.per_km_rate FROM public.vehicle_user_overrides vuo
                      WHERE vuo.vehicle_type_id = vs.vehicle_type_id AND vuo.user_id = _user_id),
                     (SELECT vrh.per_km_rate FROM public.vehicle_rate_history vrh
                      WHERE vrh.vehicle_type_id = vs.vehicle_type_id
                        AND vrh.effective_from <= d.d AND (vrh.effective_to IS NULL OR vrh.effective_to >= d.d)
                      ORDER BY vrh.effective_from DESC LIMIT 1),
                     CASE WHEN v_ta_override_applied OR v_role_rate_applied THEN v_ta_rate ELSE COALESCE(rh.rate, v_ta_rate) END)
                 WHEN v_ta_override_applied OR v_role_rate_applied THEN v_ta_rate
                 ELSE COALESCE(rh.rate, v_ta_rate)
               END
             WHEN COALESCE(a.present,0) > 0 THEN
               CASE
                 WHEN vs.vehicle_type_id IS NOT NULL THEN
                   COALESCE(
                     (SELECT vuo.fixed_ta_amount FROM public.vehicle_user_overrides vuo
                      WHERE vuo.vehicle_type_id = vs.vehicle_type_id AND vuo.user_id = _user_id),
                     NULLIF(vs.fixed_ta_amount, 0),
                     v_ta_amount)
                 ELSE v_ta_amount
               END
             ELSE 0
           END AS ta_val,
           CASE
             WHEN v_da_basis='per_half_day' THEN COALESCE(a.present,0) * v_da_amount
             ELSE (CASE WHEN COALESCE(a.present,0) > 0 THEN v_da_amount ELSE 0 END)
           END AS da_val
    FROM dates d
    LEFT JOIN att a ON a.d=d.d
    LEFT JOIN gps g ON g.d=d.d
    LEFT JOIN add_exp ae ON ae.d=d.d
    LEFT JOIN rate_hist rh ON rh.d=d.d
    LEFT JOIN veh_sel vs ON vs.d=d.d
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
  rate_hist AS (
    SELECT d.d,
           COALESCE(
             (SELECT rh.per_km_rate FROM public.ta_rate_history rh
              WHERE rh.effective_from <= d.d AND (rh.effective_to IS NULL OR rh.effective_to >= d.d)
              ORDER BY rh.effective_from DESC LIMIT 1),
             v_ta_rate
           ) AS rate
    FROM (SELECT generate_series(v_start, v_end, interval '1 day')::date AS d) d
  ),
  veh_sel AS (
    SELECT dvs.activity_date AS d, dvs.vehicle_type_id, COALESCE(vt.is_no_vehicle, false) AS is_no_vehicle,
           COALESCE(vt.fixed_ta_amount, 0) AS fixed_ta_amount
    FROM public.daily_vehicle_selections dvs
    LEFT JOIN public.vehicle_types vt ON vt.id = dvs.vehicle_type_id
    WHERE dvs.user_id = _user_id AND dvs.activity_date BETWEEN v_start AND v_end
  ),
  per_day AS (
    SELECT d.d,
           COALESCE(a.present,0) AS present,
           COALESCE(g.km, a.total_distance_km, 0) AS km,
           COALESCE(ae.total,0) AS add_total,
           CASE
             WHEN vs.vehicle_type_id IS NOT NULL AND vs.is_no_vehicle THEN 0
             WHEN v_ta_type='from_gps' THEN
               COALESCE(g.km, a.total_distance_km, 0) *
               CASE
                 WHEN vs.vehicle_type_id IS NOT NULL THEN
                   COALESCE(
                     (SELECT vuo.per_km_rate FROM public.vehicle_user_overrides vuo
                      WHERE vuo.vehicle_type_id = vs.vehicle_type_id AND vuo.user_id = _user_id),
                     (SELECT vrh.per_km_rate FROM public.vehicle_rate_history vrh
                      WHERE vrh.vehicle_type_id = vs.vehicle_type_id
                        AND vrh.effective_from <= d.d AND (vrh.effective_to IS NULL OR vrh.effective_to >= d.d)
                      ORDER BY vrh.effective_from DESC LIMIT 1),
                     CASE WHEN v_ta_override_applied OR v_role_rate_applied THEN v_ta_rate ELSE COALESCE(rh.rate, v_ta_rate) END)
                 WHEN v_ta_override_applied OR v_role_rate_applied THEN v_ta_rate
                 ELSE COALESCE(rh.rate, v_ta_rate)
               END
             WHEN COALESCE(a.present,0) > 0 THEN
               CASE
                 WHEN vs.vehicle_type_id IS NOT NULL THEN
                   COALESCE(
                     (SELECT vuo.fixed_ta_amount FROM public.vehicle_user_overrides vuo
                      WHERE vuo.vehicle_type_id = vs.vehicle_type_id AND vuo.user_id = _user_id),
                     NULLIF(vs.fixed_ta_amount, 0),
                     v_ta_amount)
                 ELSE v_ta_amount
               END
             ELSE 0
           END AS ta_val,
           CASE
             WHEN v_da_basis='per_half_day' THEN COALESCE(a.present,0) * v_da_amount
             ELSE (CASE WHEN COALESCE(a.present,0) > 0 THEN v_da_amount ELSE 0 END)
           END AS da_val
    FROM (SELECT generate_series(v_start, v_end, interval '1 day')::date AS d) d
    LEFT JOIN att a ON a.d=d.d
    LEFT JOIN gps g ON g.d=d.d
    LEFT JOIN rate_hist rh ON rh.d=d.d
    LEFT JOIN veh_sel vs ON vs.d=d.d
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