-- One-table Travel Allowance setup: fixed TA per vehicle + per-employee exceptions per vehicle.

ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS fixed_ta_amount numeric NOT NULL DEFAULT 0 CHECK (fixed_ta_amount >= 0);

CREATE TABLE IF NOT EXISTS public.vehicle_user_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type_id uuid NOT NULL REFERENCES public.vehicle_types(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  per_km_rate numeric CHECK (per_km_rate IS NULL OR per_km_rate >= 0),
  fixed_ta_amount numeric CHECK (fixed_ta_amount IS NULL OR fixed_ta_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_type_id, user_id)
);

ALTER TABLE public.vehicle_user_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicle_user_overrides admin all" ON public.vehicle_user_overrides;
CREATE POLICY "vehicle_user_overrides admin all" ON public.vehicle_user_overrides FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "vehicle_user_overrides own read" ON public.vehicle_user_overrides;
CREATE POLICY "vehicle_user_overrides own read" ON public.vehicle_user_overrides FOR SELECT TO authenticated
USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_user_overrides TO authenticated;
GRANT ALL ON public.vehicle_user_overrides TO service_role;

DROP TRIGGER IF EXISTS update_vehicle_user_overrides_updated_at ON public.vehicle_user_overrides;
CREATE TRIGGER update_vehicle_user_overrides_updated_at BEFORE UPDATE ON public.vehicle_user_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();