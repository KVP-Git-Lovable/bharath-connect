
-- Add annual_quota and accrual_type columns to leave_types
ALTER TABLE public.leave_types ADD COLUMN IF NOT EXISTS annual_quota integer NOT NULL DEFAULT 0;
ALTER TABLE public.leave_types ADD COLUMN IF NOT EXISTS accrual_type text NOT NULL DEFAULT 'yearly';

-- Backfill annual_quota from existing max_days
UPDATE public.leave_types SET annual_quota = max_days WHERE annual_quota = 0 AND max_days > 0;
