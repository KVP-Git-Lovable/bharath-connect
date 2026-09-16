-- Vehicle types for Travel Allowance: Bike / Car / Truck / Bus / Outstation
-- (Outstation = no vehicle used, so no per-km TA that day).
CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  icon text,
  is_no_vehicle boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.vehicle_types (name, icon, is_no_vehicle, sort_order) VALUES
  ('Bike', 'bike', false, 1),
  ('Car', 'car', false, 2),
  ('Truck', 'truck', false, 3),
  ('Bus', 'bus', false, 4),
  ('Outstation', 'map-pin-off', true, 5)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicle_types read authenticated" ON public.vehicle_types;
CREATE POLICY "vehicle_types read authenticated" ON public.vehicle_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "vehicle_types admin write" ON public.vehicle_types;
CREATE POLICY "vehicle_types admin write" ON public.vehicle_types FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP TRIGGER IF EXISTS update_vehicle_types_updated_at ON public.vehicle_types;
CREATE TRIGGER update_vehicle_types_updated_at BEFORE UPDATE ON public.vehicle_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-vehicle rate history, same date-effective pattern as ta_rate_history.
CREATE TABLE IF NOT EXISTS public.vehicle_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type_id uuid NOT NULL REFERENCES public.vehicle_types(id) ON DELETE CASCADE,
  per_km_rate numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  effective_to date,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_type_id, effective_from)
);

ALTER TABLE public.vehicle_rate_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicle_rate_history read authenticated" ON public.vehicle_rate_history;
CREATE POLICY "vehicle_rate_history read authenticated" ON public.vehicle_rate_history FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "vehicle_rate_history admin write" ON public.vehicle_rate_history;
CREATE POLICY "vehicle_rate_history admin write" ON public.vehicle_rate_history FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP TRIGGER IF EXISTS update_vehicle_rate_history_updated_at ON public.vehicle_rate_history;
CREATE TRIGGER update_vehicle_rate_history_updated_at BEFORE UPDATE ON public.vehicle_rate_history
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Which vehicle types a role (security profile) is allowed to use.
-- A role with no rows here falls back to "all active vehicle types" (see app query),
-- so nothing breaks for a role admins haven't configured yet.
CREATE TABLE IF NOT EXISTS public.role_vehicle_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.security_profiles(id) ON DELETE CASCADE,
  vehicle_type_id uuid NOT NULL REFERENCES public.vehicle_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, vehicle_type_id)
);

ALTER TABLE public.role_vehicle_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_vehicle_types read authenticated" ON public.role_vehicle_types;
CREATE POLICY "role_vehicle_types read authenticated" ON public.role_vehicle_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "role_vehicle_types admin write" ON public.role_vehicle_types;
CREATE POLICY "role_vehicle_types admin write" ON public.role_vehicle_types FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- One vehicle choice per user per day, made on the Activities page.
CREATE TABLE IF NOT EXISTS public.daily_vehicle_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  vehicle_type_id uuid NOT NULL REFERENCES public.vehicle_types(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_date)
);

ALTER TABLE public.daily_vehicle_selections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_vehicle_selections select own or team" ON public.daily_vehicle_selections;
CREATE POLICY "daily_vehicle_selections select own or team" ON public.daily_vehicle_selections FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR user_id IN (SELECT sub.user_id FROM public.get_user_hierarchy(auth.uid()) sub)
);
DROP POLICY IF EXISTS "daily_vehicle_selections write own" ON public.daily_vehicle_selections;
CREATE POLICY "daily_vehicle_selections write own" ON public.daily_vehicle_selections FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "daily_vehicle_selections update own" ON public.daily_vehicle_selections;
CREATE POLICY "daily_vehicle_selections update own" ON public.daily_vehicle_selections FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "daily_vehicle_selections admin manage" ON public.daily_vehicle_selections;
CREATE POLICY "daily_vehicle_selections admin manage" ON public.daily_vehicle_selections FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP TRIGGER IF EXISTS update_daily_vehicle_selections_updated_at ON public.daily_vehicle_selections;
CREATE TRIGGER update_daily_vehicle_selections_updated_at BEFORE UPDATE ON public.daily_vehicle_selections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed each non-"no vehicle" type with a starting rate of 0, from the same
-- date the flat org-wide rate history starts, so nothing is undefined.
INSERT INTO public.vehicle_rate_history (vehicle_type_id, per_km_rate, effective_from, note)
SELECT vt.id, 0, '2000-01-01'::date, 'Initial rate'
FROM public.vehicle_types vt
WHERE vt.is_no_vehicle = false
ON CONFLICT (vehicle_type_id, effective_from) DO NOTHING;

-- Rewire TA calculation: when a day has a vehicle selection, price that
-- day's km at that vehicle's own date-effective rate. Outstation (no
-- vehicle) means no per-km TA that day. A user/group/team override still
-- wins over any vehicle-based rate, same as it already won over the flat
-- org-wide rate. Days with no vehicle selection keep the old flat-rate
-- behavior untouched, so nothing breaks for data recorded before this
-- feature existed.
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
      WHERE m.user_id=_user_id LIMIT 1;
    IF v_group_id IS NOT NULL THEN
      SELECT ta_type, fixed_ta_amount, ta_per_km_rate INTO v_ta_type, v_ta_amount, v_ta_rate
        FROM public.expense_groups WHERE id=v_group_id;
      v_ta_override_applied := true;
    ELSIF v_manager_id IS NOT NULL THEN
      SELECT amount INTO v_override FROM public.expense_overrides WHERE field='ta' AND ref_type='team' AND ref_id=v_manager_id;
      IF v_override IS NOT NULL THEN
        IF v_ta_type='fixed' THEN v_ta_amount := v_override; ELSE v_ta_rate := v_override; END IF;
        v_ta_override_applied := true;
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
    SELECT dvs.activity_date AS d, dvs.vehicle_type_id, COALESCE(vt.is_no_vehicle, false) AS is_no_vehicle
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
             WHEN v_ta_type='from_gps' THEN
               CASE
                 WHEN v_ta_override_applied THEN COALESCE(g.km, a.total_distance_km, 0) * v_ta_rate
                 WHEN vs.vehicle_type_id IS NOT NULL AND vs.is_no_vehicle THEN 0
                 WHEN vs.vehicle_type_id IS NOT NULL THEN
                   COALESCE(g.km, a.total_distance_km, 0) *
                   COALESCE(
                     (SELECT vrh.per_km_rate FROM public.vehicle_rate_history vrh
                      WHERE vrh.vehicle_type_id = vs.vehicle_type_id
                        AND vrh.effective_from <= d.d AND (vrh.effective_to IS NULL OR vrh.effective_to >= d.d)
                      ORDER BY vrh.effective_from DESC LIMIT 1),
                     rh.rate, v_ta_rate)
                 ELSE COALESCE(g.km, a.total_distance_km, 0) * COALESCE(rh.rate, v_ta_rate)
               END
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
    SELECT dvs.activity_date AS d, dvs.vehicle_type_id, COALESCE(vt.is_no_vehicle, false) AS is_no_vehicle
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
             WHEN v_ta_type='from_gps' THEN
               CASE
                 WHEN v_ta_override_applied THEN COALESCE(g.km, a.total_distance_km, 0) * v_ta_rate
                 WHEN vs.vehicle_type_id IS NOT NULL AND vs.is_no_vehicle THEN 0
                 WHEN vs.vehicle_type_id IS NOT NULL THEN
                   COALESCE(g.km, a.total_distance_km, 0) *
                   COALESCE(
                     (SELECT vrh.per_km_rate FROM public.vehicle_rate_history vrh
                      WHERE vrh.vehicle_type_id = vs.vehicle_type_id
                        AND vrh.effective_from <= d.d AND (vrh.effective_to IS NULL OR vrh.effective_to >= d.d)
                      ORDER BY vrh.effective_from DESC LIMIT 1),
                     rh.rate, v_ta_rate)
                 ELSE COALESCE(g.km, a.total_distance_km, 0) * COALESCE(rh.rate, v_ta_rate)
               END
             ELSE (CASE WHEN COALESCE(a.present,0) > 0 THEN v_ta_amount ELSE 0 END)
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
