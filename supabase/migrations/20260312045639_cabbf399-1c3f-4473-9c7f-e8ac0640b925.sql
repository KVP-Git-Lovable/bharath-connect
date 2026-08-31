
CREATE OR REPLACE FUNCTION public.recalculate_monthly_leave_accruals(_target_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;
