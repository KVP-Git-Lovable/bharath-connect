
-- ============================================================
-- Phase 1: New tables & Alter existing tables for Attendance Module
-- ============================================================

-- 1. week_off_config
CREATE TABLE public.week_off_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_off boolean NOT NULL DEFAULT false,
  alternate_pattern text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day_of_week)
);

ALTER TABLE public.week_off_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage week_off_config"
  ON public.week_off_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view week_off_config"
  ON public.week_off_config FOR SELECT
  TO authenticated
  USING (true);

-- Seed default week-off config (all 7 days, Sunday off)
INSERT INTO public.week_off_config (day_of_week, is_off, alternate_pattern) VALUES
  (0, true, 'all'),
  (1, false, null),
  (2, false, null),
  (3, false, null),
  (4, false, null),
  (5, false, null),
  (6, false, null);

-- 2. working_days_config
CREATE TABLE public.working_days_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  total_days integer NOT NULL DEFAULT 0,
  working_days integer NOT NULL DEFAULT 0,
  week_offs integer NOT NULL DEFAULT 0,
  holidays integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(year, month)
);

ALTER TABLE public.working_days_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage working_days_config"
  ON public.working_days_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view working_days_config"
  ON public.working_days_config FOR SELECT
  TO authenticated
  USING (true);

-- 3. attendance_policy
CREATE TABLE public.attendance_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL UNIQUE,
  policy_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage attendance_policy"
  ON public.attendance_policy FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view attendance_policy"
  ON public.attendance_policy FOR SELECT
  TO authenticated
  USING (true);

-- 4. leave_policy (used by AttendancePolicyConfig for leave entitlements)
CREATE TABLE public.leave_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id),
  yearly_entitlement integer NOT NULL DEFAULT 12,
  monthly_accrual numeric,
  accrual_type text NOT NULL DEFAULT 'yearly',
  carry_forward_allowed boolean NOT NULL DEFAULT false,
  max_carry_forward integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(leave_type_id)
);

ALTER TABLE public.leave_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage leave_policy"
  ON public.leave_policy FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view leave_policy"
  ON public.leave_policy FOR SELECT
  TO authenticated
  USING (true);

-- 5. Alter regularization_requests - add staging columns
ALTER TABLE public.regularization_requests
  ADD COLUMN IF NOT EXISTS attendance_date date,
  ADD COLUMN IF NOT EXISTS current_check_in_time timestamptz,
  ADD COLUMN IF NOT EXISTS current_check_out_time timestamptz,
  ADD COLUMN IF NOT EXISTS requested_check_in_time timestamptz,
  ADD COLUMN IF NOT EXISTS requested_check_out_time timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Backfill attendance_date from existing date column
UPDATE public.regularization_requests SET attendance_date = date WHERE attendance_date IS NULL;

-- 6. Alter leave_applications - add staging columns
ALTER TABLE public.leave_applications
  ADD COLUMN IF NOT EXISTS applied_date timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_date timestamptz,
  ADD COLUMN IF NOT EXISTS is_half_day boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS half_day_period text;

-- Backfill applied_date from created_at
UPDATE public.leave_applications SET applied_date = created_at WHERE applied_date IS NULL;

-- 7. Alter attendance - add staging columns
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS check_in_address text,
  ADD COLUMN IF NOT EXISTS check_out_address text,
  ADD COLUMN IF NOT EXISTS face_verification_status text,
  ADD COLUMN IF NOT EXISTS face_match_confidence numeric,
  ADD COLUMN IF NOT EXISTS face_verification_status_out text,
  ADD COLUMN IF NOT EXISTS face_match_confidence_out numeric,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS regularized_request_id uuid;

-- Add unique constraint on (user_id, date) for attendance upsert
ALTER TABLE public.attendance ADD CONSTRAINT attendance_user_date_unique UNIQUE (user_id, date);

-- 8. Alter leave_balance - add unique constraint for upsert
ALTER TABLE public.leave_balance ADD CONSTRAINT leave_balance_user_type_year_unique UNIQUE (user_id, leave_type_id, year);

-- 9. Triggers for updated_at
CREATE TRIGGER update_week_off_config_updated_at
  BEFORE UPDATE ON public.week_off_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_working_days_config_updated_at
  BEFORE UPDATE ON public.working_days_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_policy_updated_at
  BEFORE UPDATE ON public.attendance_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_policy_updated_at
  BEFORE UPDATE ON public.leave_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
