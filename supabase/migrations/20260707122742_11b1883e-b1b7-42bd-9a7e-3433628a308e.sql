
-- expense_master_config extensions
ALTER TABLE public.expense_master_config
  ADD COLUMN IF NOT EXISTS ta_per_km_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS da_calculation_basis text NOT NULL DEFAULT 'per_day';

UPDATE public.expense_master_config SET ta_type = 'from_gps' WHERE ta_type NOT IN ('fixed','from_gps');

ALTER TABLE public.expense_master_config
  DROP CONSTRAINT IF EXISTS expense_master_config_ta_type_check;
ALTER TABLE public.expense_master_config
  ADD CONSTRAINT expense_master_config_ta_type_check CHECK (ta_type IN ('fixed','from_gps'));
ALTER TABLE public.expense_master_config
  DROP CONSTRAINT IF EXISTS expense_master_config_da_basis_check;
ALTER TABLE public.expense_master_config
  ADD CONSTRAINT expense_master_config_da_basis_check CHECK (da_calculation_basis IN ('per_day','per_half_day'));

-- expense_policy extensions
ALTER TABLE public.expense_policy
  ADD COLUMN IF NOT EXISTS max_additional_expense_per_day numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_additional_expense_per_month numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS require_bill_above_amount numeric NOT NULL DEFAULT 500;

-- expense_overrides
CREATE TABLE IF NOT EXISTS public.expense_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field text NOT NULL CHECK (field IN ('ta','da')),
  ref_type text NOT NULL CHECK (ref_type IN ('user','team')),
  ref_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field, ref_type, ref_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_overrides TO authenticated;
GRANT ALL ON public.expense_overrides TO service_role;
ALTER TABLE public.expense_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_overrides read authenticated" ON public.expense_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "expense_overrides admin write" ON public.expense_overrides FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER expense_overrides_updated_at BEFORE UPDATE ON public.expense_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- expense_groups
CREATE TABLE IF NOT EXISTS public.expense_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  ta_type text NOT NULL DEFAULT 'fixed' CHECK (ta_type IN ('fixed','from_gps')),
  fixed_ta_amount numeric NOT NULL DEFAULT 0,
  ta_per_km_rate numeric NOT NULL DEFAULT 0,
  da_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_groups TO authenticated;
GRANT ALL ON public.expense_groups TO service_role;
ALTER TABLE public.expense_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_groups read authenticated" ON public.expense_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "expense_groups admin write" ON public.expense_groups FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER expense_groups_updated_at BEFORE UPDATE ON public.expense_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- expense_group_members
CREATE TABLE IF NOT EXISTS public.expense_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_group_members TO authenticated;
GRANT ALL ON public.expense_group_members TO service_role;
ALTER TABLE public.expense_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_group_members read authenticated" ON public.expense_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "expense_group_members admin write" ON public.expense_group_members FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Monthly summary RPC
CREATE OR REPLACE FUNCTION public.get_monthly_expense_summary(_user_id uuid, _year_month text)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Effective TA (fixed or per-km): user > group > team > global
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

  -- Effective DA
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

  -- Present days & km per date
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
  gps AS (
    SELECT date::date AS d, COALESCE(SUM(total_km_today),0) AS km
    FROM public.gps_tracking WHERE user_id = _user_id AND date::date BETWEEN v_start AND v_end
    GROUP BY date::date
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

  -- Weekly aggregation
  WITH per_day AS (
    SELECT (elem->>'date')::date AS d,
           (elem->>'ta')::numeric AS ta,
           (elem->>'da')::numeric AS da,
           (elem->>'additional')::numeric AS additional
    FROM json_array_elements(v_daily) AS elem
  )
  SELECT json_agg(json_build_object(
    'week_start', to_char(date_trunc('week', d)::date,'YYYY-MM-DD'),
    'ta', ta_sum,
    'da', da_sum,
    'additional', add_sum
  ) ORDER BY week_start) INTO v_weekly
  FROM (
    SELECT date_trunc('week', d)::date AS week_start,
           SUM(ta) AS ta_sum, SUM(da) AS da_sum, SUM(additional) AS add_sum
    FROM per_day GROUP BY 1
  ) w;

  RETURN json_build_object(
    'ta', v_ta,
    'da', v_da,
    'additional_approved', v_add_approved,
    'additional_pending', v_add_pending,
    'total', v_ta + v_da + v_add_approved,
    'present_days', v_present_days,
    'total_km', v_total_km,
    'daily', COALESCE(v_daily,'[]'::json),
    'weekly', COALESCE(v_weekly,'[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_expense_summary(uuid, text) TO authenticated;
