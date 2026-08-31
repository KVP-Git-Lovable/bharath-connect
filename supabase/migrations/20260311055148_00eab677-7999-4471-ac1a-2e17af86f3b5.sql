CREATE TABLE public.global_leave_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reset_cycle text NOT NULL DEFAULT 'calendar_year',
  allow_negative_balance boolean NOT NULL DEFAULT false,
  max_negative_days integer NOT NULL DEFAULT 0,
  carry_forward_enabled boolean NOT NULL DEFAULT false,
  max_carry_forward_days integer NOT NULL DEFAULT 0,
  sandwich_rule_enabled boolean NOT NULL DEFAULT false,
  half_day_enabled boolean NOT NULL DEFAULT true,
  allow_backdated_leave boolean NOT NULL DEFAULT true,
  max_backdate_days integer NOT NULL DEFAULT 30,
  notice_period_days integer NOT NULL DEFAULT 0,
  max_continuous_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_leave_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage global_leave_policy" ON public.global_leave_policy
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view global_leave_policy" ON public.global_leave_policy
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.leave_type_policy_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  override_negative_balance boolean DEFAULT NULL,
  max_negative_days integer DEFAULT NULL,
  override_carry_forward boolean DEFAULT NULL,
  max_carry_forward_days integer DEFAULT NULL,
  custom_reset_cycle text DEFAULT NULL,
  min_notice_days integer DEFAULT NULL,
  max_continuous_days integer DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (leave_type_id)
);

ALTER TABLE public.leave_type_policy_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage leave_type_policy_override" ON public.leave_type_policy_override
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view leave_type_policy_override" ON public.leave_type_policy_override
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.regularization_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_limit integer NOT NULL DEFAULT 3,
  daily_limit integer NOT NULL DEFAULT 1,
  max_backdate_days integer NOT NULL DEFAULT 7,
  approval_mode text NOT NULL DEFAULT 'manager',
  auto_approve_within_hours numeric DEFAULT NULL,
  post_approval_status text NOT NULL DEFAULT 'regularized',
  require_reason boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regularization_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage regularization_policy" ON public.regularization_policy
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view regularization_policy" ON public.regularization_policy
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.global_leave_policy (id) VALUES (gen_random_uuid());
INSERT INTO public.regularization_policy (id) VALUES (gen_random_uuid());