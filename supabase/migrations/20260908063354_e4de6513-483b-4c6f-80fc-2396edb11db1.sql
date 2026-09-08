ALTER TABLE public.accrual_config
  ADD COLUMN IF NOT EXISTS leave_type_id uuid REFERENCES public.leave_types(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS accrual_config_leave_type_id_key ON public.accrual_config (leave_type_id);
ALTER TABLE public.leave_policy
  ADD COLUMN IF NOT EXISTS last_update_mode text;