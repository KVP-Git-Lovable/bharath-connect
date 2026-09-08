-- 1. Auto End Day policy
CREATE TABLE IF NOT EXISTS public.auto_end_day_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT true,
  auto_close_time time NOT NULL DEFAULT '22:00:00',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  last_activity_source text NOT NULL DEFAULT 'all_activity',
  pre_warning_enabled boolean NOT NULL DEFAULT true,
  pre_warning_minutes_before integer NOT NULL DEFAULT 30,
  pre_warning_time time NOT NULL DEFAULT '22:00:00',
  close_in_progress_visits boolean NOT NULL DEFAULT true,
  cancel_planned_visits boolean NOT NULL DEFAULT true,
  mark_unproductive boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_end_day_policy TO authenticated;
GRANT ALL ON public.auto_end_day_policy TO service_role;
ALTER TABLE public.auto_end_day_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage auto_end_day_policy" ON public.auto_end_day_policy;
CREATE POLICY "Admins can manage auto_end_day_policy" ON public.auto_end_day_policy
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Authenticated can view auto_end_day_policy" ON public.auto_end_day_policy;
CREATE POLICY "Authenticated can view auto_end_day_policy" ON public.auto_end_day_policy
  FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS update_auto_end_day_policy_updated_at ON public.auto_end_day_policy;
CREATE TRIGGER update_auto_end_day_policy_updated_at BEFORE UPDATE ON public.auto_end_day_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Accrual config
CREATE TABLE IF NOT EXISTS public.accrual_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frequency text NOT NULL DEFAULT 'monthly',
  divisor numeric NOT NULL DEFAULT 12,
  round_mode text NOT NULL DEFAULT 'nearest_half',
  prorate_joining boolean NOT NULL DEFAULT true,
  credit_day integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accrual_config TO authenticated;
GRANT ALL ON public.accrual_config TO service_role;
ALTER TABLE public.accrual_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage accrual_config" ON public.accrual_config;
CREATE POLICY "Admins can manage accrual_config" ON public.accrual_config
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Authenticated can view accrual_config" ON public.accrual_config;
CREATE POLICY "Authenticated can view accrual_config" ON public.accrual_config
  FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS update_accrual_config_updated_at ON public.accrual_config;
CREATE TRIGGER update_accrual_config_updated_at BEFORE UPDATE ON public.accrual_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. global_leave_policy additive columns
ALTER TABLE public.global_leave_policy
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_reset_date date,
  ADD COLUMN IF NOT EXISTS max_negative_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enable_carry_forward boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_carry_forward_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carry_forward_expiry_months integer,
  ADD COLUMN IF NOT EXISTS min_notice_period_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_continuous_leave_days integer,
  ADD COLUMN IF NOT EXISTS enable_half_day boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_sandwich_rule boolean NOT NULL DEFAULT false;

UPDATE public.global_leave_policy SET
  max_negative_limit = COALESCE(max_negative_days, max_negative_limit),
  enable_carry_forward = COALESCE(carry_forward_enabled, enable_carry_forward),
  max_carry_forward_limit = COALESCE(max_carry_forward_days, max_carry_forward_limit),
  min_notice_period_days = COALESCE(notice_period_days, min_notice_period_days),
  max_continuous_leave_days = COALESCE(max_continuous_days, max_continuous_leave_days),
  enable_half_day = COALESCE(half_day_enabled, enable_half_day),
  enable_sandwich_rule = COALESCE(sandwich_rule_enabled, enable_sandwich_rule);

-- 4. leave_type_policy_override additive columns
ALTER TABLE public.leave_type_policy_override
  ADD COLUMN IF NOT EXISTS override_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_negative_balance boolean,
  ADD COLUMN IF NOT EXISTS max_negative_limit integer,
  ADD COLUMN IF NOT EXISTS enable_carry_forward boolean,
  ADD COLUMN IF NOT EXISTS max_carry_forward_limit integer,
  ADD COLUMN IF NOT EXISTS carry_forward_expiry_months integer;

UPDATE public.leave_type_policy_override SET
  allow_negative_balance = COALESCE(allow_negative_balance, override_negative_balance),
  max_negative_limit = COALESCE(max_negative_limit, max_negative_days),
  enable_carry_forward = COALESCE(enable_carry_forward, override_carry_forward),
  max_carry_forward_limit = COALESCE(max_carry_forward_limit, max_carry_forward_days);

-- 5. regularization_policy additive columns
ALTER TABLE public.regularization_policy
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_checkin_edit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_checkout_edit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_status_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reason_mandatory boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_previous_month boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restrict_after_payroll_lock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS update_attendance_on_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recalculate_hours boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS adjust_leave_balance boolean NOT NULL DEFAULT false;

ALTER TABLE public.regularization_policy ALTER COLUMN monthly_limit DROP NOT NULL;