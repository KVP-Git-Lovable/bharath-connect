CREATE TABLE public.master_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address_name text NOT NULL,
  full_address text,
  city text,
  state text,
  pincode text,
  gst_number text,
  contact_persons jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_addresses TO authenticated;
GRANT ALL ON public.master_addresses TO service_role;

ALTER TABLE public.master_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view addresses"
  ON public.master_addresses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers can insert addresses"
  ON public.master_addresses FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR can_access_object(auth.uid(), 'module_procurement'::text, 'create'::text));

CREATE POLICY "Managers can update addresses"
  ON public.master_addresses FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR can_access_object(auth.uid(), 'module_procurement'::text, 'edit'::text));

CREATE POLICY "Managers can delete addresses"
  ON public.master_addresses FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR can_access_object(auth.uid(), 'module_procurement'::text, 'delete'::text));

CREATE TRIGGER update_master_addresses_updated_at
  BEFORE UPDATE ON public.master_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.procurement_orders
  ADD COLUMN IF NOT EXISTS bill_to_address_id text,
  ADD COLUMN IF NOT EXISTS ship_to_address_id text,
  ADD COLUMN IF NOT EXISTS bill_to_gst text,
  ADD COLUMN IF NOT EXISTS ship_to_gst text;