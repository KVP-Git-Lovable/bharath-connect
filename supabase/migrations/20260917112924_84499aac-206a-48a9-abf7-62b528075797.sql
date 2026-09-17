-- Activities: pinned vehicle + per-activity travel expense.
-- 1. user_pinned_vehicles: one pinned vehicle per user, kept until the user unpins it (survives check-out / logout).
-- 2. activity_events.vehicle_type_id: the vehicle in use when the activity was checked in.
-- 3. get_activity_travel_expense(activity): amount shown in Edit Activity -> Effort -> Travel expense.
--    Day TA (get_monthly_expense_summary) is unchanged: it still uses the day's vehicle.

CREATE TABLE IF NOT EXISTS public.user_pinned_vehicles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_type_id uuid NOT NULL REFERENCES public.vehicle_types(id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_pinned_vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_pinned_vehicles own all" ON public.user_pinned_vehicles;
CREATE POLICY "user_pinned_vehicles own all" ON public.user_pinned_vehicles FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "user_pinned_vehicles admin or team read" ON public.user_pinned_vehicles;
CREATE POLICY "user_pinned_vehicles admin or team read" ON public.user_pinned_vehicles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id IN (SELECT sub.user_id FROM public.get_user_hierarchy(auth.uid()) sub)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_pinned_vehicles TO authenticated;
GRANT ALL ON public.user_pinned_vehicles TO service_role;
DROP TRIGGER IF EXISTS update_user_pinned_vehicles_updated_at ON public.user_pinned_vehicles;
CREATE TRIGGER update_user_pinned_vehicles_updated_at BEFORE UPDATE ON public.user_pinned_vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS vehicle_type_id uuid REFERENCES public.vehicle_types(id) ON DELETE SET NULL;


CREATE OR REPLACE FUNCTION public.get_activity_travel_expense(_activity_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_act RECORD;
  v_cfg RECORD;
  v_user uuid;
  v_date date;
  v_ta_type text := 'from_gps';
  v_ta_amount numeric := 0;
  v_ta_rate numeric := 0;
  v_default_on boolean := true;
  v_override numeric;
  v_person_custom boolean := false;
  v_person_source text := 'default';
  v_group_id uuid;
  v_manager_id uuid;
  v_vehicle_id uuid;
  v_vehicle_source text := null;
  v_vehicle_name text;
  v_is_no_vehicle boolean := false;
  v_vehicle_fixed numeric := 0;
  v_vuo_rate numeric;
  v_vuo_fixed numeric;
  v_vehicle_rate numeric;
  v_hist_rate numeric;
  v_km numeric;
  v_rate numeric;
  v_amount numeric;
  v_source text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, user_id, activity_date, vehicle_type_id, travel_distance_km, manual_distance_km
    INTO v_act FROM public.activity_events WHERE id = _activity_id;
  IF v_act.id IS NULL THEN RETURN NULL; END IF;
  v_user := v_act.user_id;
  v_date := v_act.activity_date::date;

  IF v_user IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h WHERE h.user_id = v_user)
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Company default
  SELECT * INTO v_cfg FROM public.expense_master_config ORDER BY updated_at DESC LIMIT 1;
  IF v_cfg.id IS NOT NULL THEN
    v_ta_type := COALESCE(v_cfg.ta_type, 'from_gps');
    v_ta_amount := COALESCE(v_cfg.fixed_ta_amount, 0);
    v_ta_rate := COALESCE(v_cfg.ta_per_km_rate, 0);
    v_default_on := COALESCE(v_cfg.ta_default_enabled, true);
  END IF;
  IF NOT v_default_on THEN v_ta_amount := 0; v_ta_rate := 0; END IF;

  -- The person's own TA (same order as the monthly summary)
  SELECT reporting_manager_id INTO v_manager_id FROM public.users WHERE id = v_user;
  SELECT amount INTO v_override FROM public.expense_overrides WHERE field='ta' AND ref_type='user' AND ref_id=v_user;
  IF v_override IS NOT NULL THEN
    IF v_ta_type='fixed' THEN v_ta_amount := v_override; ELSE v_ta_rate := v_override; END IF;
    v_person_custom := true; v_person_source := 'user';
  ELSE
    SELECT g.id INTO v_group_id FROM public.expense_groups g
      JOIN public.expense_group_members m ON m.group_id=g.id
      WHERE m.user_id=v_user AND g.is_active
        AND (COALESCE(g.fixed_ta_amount,0) > 0 OR COALESCE(g.ta_per_km_rate,0) > 0)
      ORDER BY g.created_at LIMIT 1;
    IF v_group_id IS NOT NULL THEN
      SELECT fixed_ta_amount, ta_per_km_rate INTO v_ta_amount, v_ta_rate FROM public.expense_groups WHERE id=v_group_id;
      v_person_custom := true; v_person_source := 'row';
    ELSE
      IF v_manager_id IS NOT NULL THEN
        SELECT amount INTO v_override FROM public.expense_overrides WHERE field='ta' AND ref_type='team' AND ref_id=v_manager_id;
        IF v_override IS NOT NULL THEN
          IF v_ta_type='fixed' THEN v_ta_amount := v_override; ELSE v_ta_rate := v_override; END IF;
          v_person_custom := true; v_person_source := 'team';
        END IF;
      END IF;
      IF NOT v_person_custom THEN
        SELECT g.id INTO v_group_id FROM public.expense_groups g
          JOIN public.user_security_profiles usp ON usp.profile_id = ANY(g.role_ids)
          WHERE usp.user_id = v_user AND g.is_active
          ORDER BY g.created_at LIMIT 1;
        IF v_group_id IS NOT NULL THEN
          SELECT COALESCE(fixed_ta_amount,0), COALESCE(ta_per_km_rate,0) INTO v_ta_amount, v_ta_rate
            FROM public.expense_groups WHERE id=v_group_id;
          v_person_custom := true; v_person_source := 'role';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Vehicle: saved on the activity, else the day's vehicle
  v_vehicle_id := v_act.vehicle_type_id;
  IF v_vehicle_id IS NOT NULL THEN
    v_vehicle_source := 'activity';
  ELSE
    SELECT vehicle_type_id INTO v_vehicle_id FROM public.daily_vehicle_selections
      WHERE user_id = v_user AND activity_date = v_date;
    IF v_vehicle_id IS NOT NULL THEN v_vehicle_source := 'day'; END IF;
  END IF;
  IF v_vehicle_id IS NOT NULL THEN
    SELECT name, COALESCE(is_no_vehicle,false), COALESCE(fixed_ta_amount,0)
      INTO v_vehicle_name, v_is_no_vehicle, v_vehicle_fixed
      FROM public.vehicle_types WHERE id = v_vehicle_id;
    SELECT per_km_rate, fixed_ta_amount INTO v_vuo_rate, v_vuo_fixed
      FROM public.vehicle_user_overrides WHERE vehicle_type_id = v_vehicle_id AND user_id = v_user;
    SELECT per_km_rate INTO v_vehicle_rate FROM public.vehicle_rate_history
      WHERE vehicle_type_id = v_vehicle_id AND effective_from <= v_date AND (effective_to IS NULL OR effective_to >= v_date)
      ORDER BY effective_from DESC LIMIT 1;
  END IF;

  v_km := COALESCE(v_act.manual_distance_km, v_act.travel_distance_km);

  IF v_is_no_vehicle THEN
    v_rate := 0; v_amount := 0; v_source := 'no_vehicle';
  ELSIF v_ta_type = 'fixed' THEN
    IF v_vehicle_id IS NOT NULL AND v_vuo_fixed IS NOT NULL THEN
      v_rate := v_vuo_fixed; v_source := 'personal_vehicle';
    ELSIF v_vehicle_id IS NOT NULL AND v_vehicle_fixed > 0 THEN
      v_rate := v_vehicle_fixed; v_source := 'vehicle';
    ELSE
      v_rate := v_ta_amount; v_source := v_person_source;
    END IF;
    v_amount := v_rate;
  ELSE
    IF v_vehicle_id IS NOT NULL AND v_vuo_rate IS NOT NULL THEN
      v_rate := v_vuo_rate; v_source := 'personal_vehicle';
    ELSIF v_vehicle_id IS NOT NULL AND v_vehicle_rate IS NOT NULL THEN
      v_rate := v_vehicle_rate; v_source := 'vehicle';
    ELSIF v_person_custom THEN
      v_rate := v_ta_rate; v_source := v_person_source;
    ELSE
      IF v_default_on THEN
        SELECT per_km_rate INTO v_hist_rate FROM public.ta_rate_history
          WHERE effective_from <= v_date AND (effective_to IS NULL OR effective_to >= v_date)
          ORDER BY effective_from DESC LIMIT 1;
      END IF;
      v_rate := CASE WHEN v_default_on THEN COALESCE(v_hist_rate, v_ta_rate) ELSE 0 END;
      v_source := 'default';
    END IF;
    v_amount := CASE WHEN v_km IS NULL THEN NULL ELSE round(v_km * v_rate, 2) END;
  END IF;

  RETURN json_build_object(
    'method', v_ta_type,
    'vehicle_id', v_vehicle_id,
    'vehicle_name', v_vehicle_name,
    'vehicle_source', v_vehicle_source,
    'is_no_vehicle', v_is_no_vehicle,
    'km', v_km,
    'rate', v_rate,
    'rate_source', v_source,
    'amount', v_amount
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_activity_travel_expense(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_activity_travel_expense(uuid) TO authenticated, service_role;