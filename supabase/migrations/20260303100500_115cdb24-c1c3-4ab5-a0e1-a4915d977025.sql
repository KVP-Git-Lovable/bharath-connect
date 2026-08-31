
-- Auto-initialize leave balances for newly created users
CREATE OR REPLACE FUNCTION public.auto_init_leave_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lt RECORD;
  v_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  v_doj DATE;
  v_eligible_months INT;
  v_allocated NUMERIC;
BEGIN
  -- Get DOJ from employees table if available
  SELECT date_of_joining INTO v_doj FROM public.employees WHERE user_id = NEW.id;

  FOR lt IN SELECT id, annual_quota, accrual_type FROM public.leave_types WHERE is_active = true
  LOOP
    -- Calculate eligible months
    IF v_doj IS NOT NULL AND EXTRACT(YEAR FROM v_doj) = v_year THEN
      v_eligible_months := GREATEST(0, 12 - EXTRACT(MONTH FROM v_doj)::INT + 1);
    ELSIF v_doj IS NOT NULL AND EXTRACT(YEAR FROM v_doj) > v_year THEN
      v_eligible_months := 0;
    ELSE
      v_eligible_months := 12;
    END IF;

    IF lt.accrual_type = 'monthly' THEN
      v_allocated := FLOOR((lt.annual_quota::NUMERIC / 12) * v_eligible_months);
    ELSE
      IF v_doj IS NOT NULL AND EXTRACT(YEAR FROM v_doj) = v_year THEN
        v_allocated := FLOOR((lt.annual_quota::NUMERIC / 12) * v_eligible_months);
      ELSIF v_doj IS NOT NULL AND EXTRACT(YEAR FROM v_doj) > v_year THEN
        v_allocated := 0;
      ELSE
        v_allocated := lt.annual_quota;
      END IF;
    END IF;

    INSERT INTO public.leave_balance (user_id, leave_type_id, opening_balance, used_balance, year)
    VALUES (NEW.id, lt.id, v_allocated, 0, v_year)
    ON CONFLICT (user_id, leave_type_id, year) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_init_leave_balances
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_init_leave_balances();
