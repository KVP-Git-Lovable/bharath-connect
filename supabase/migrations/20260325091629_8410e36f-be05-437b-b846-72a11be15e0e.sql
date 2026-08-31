CREATE OR REPLACE FUNCTION public.get_dashboard_summary()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  v_result json;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT json_build_object(
    'pending_leaves', (
      SELECT COALESCE(COUNT(*), 0)
      FROM public.leave_applications
      WHERE user_id = v_uid AND status = 'pending'
    ),
    'activities_total', (
      SELECT COALESCE(COUNT(*), 0)
      FROM public.activity_events
      WHERE user_id = v_uid
    ),
    'activities_completed', (
      SELECT COALESCE(COUNT(*), 0)
      FROM public.activity_events
      WHERE user_id = v_uid AND status = 'completed'
    ),
    'activities_in_progress', (
      SELECT COALESCE(COUNT(*), 0)
      FROM public.activity_events
      WHERE user_id = v_uid AND status = 'in_progress'
    ),
    'today_activities', (
      SELECT COALESCE(COUNT(*), 0)
      FROM public.activity_events
      WHERE user_id = v_uid AND activity_date = v_today
    ),
    'pending_expenses_count', (
      SELECT COALESCE(COUNT(*), 0)
      FROM public.additional_expenses
      WHERE user_id = v_uid AND status = 'pending'
    ),
    'pending_expenses_total', (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.additional_expenses
      WHERE user_id = v_uid AND status = 'pending'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;