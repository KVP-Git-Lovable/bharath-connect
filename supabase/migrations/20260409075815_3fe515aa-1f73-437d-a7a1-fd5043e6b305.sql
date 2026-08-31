
-- Create vendors table
CREATE TABLE public.vendors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  company text,
  contact_person text,
  email text,
  address text,
  category text,
  services text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendors_phone_unique UNIQUE (phone)
);

-- Enable RLS
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage all vendors"
ON public.vendors FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view vendors"
ON public.vendors FOR SELECT
TO authenticated
USING (true);

-- Timestamp trigger
CREATE TRIGGER update_vendors_updated_at
BEFORE UPDATE ON public.vendors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
