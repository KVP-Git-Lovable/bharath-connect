
CREATE TABLE public.customer_contact_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.customer_contacts(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, contact_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contact_roles TO authenticated;
GRANT ALL ON public.customer_contact_roles TO service_role;
ALTER TABLE public.customer_contact_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage contact roles"
  ON public.customer_contact_roles FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER update_customer_contact_roles_updated_at
  BEFORE UPDATE ON public.customer_contact_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_ccr_customer ON public.customer_contact_roles(customer_id);
CREATE INDEX idx_ccr_contact ON public.customer_contact_roles(contact_id);
