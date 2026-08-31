
CREATE TABLE public.opportunity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_types TO authenticated;
GRANT ALL ON public.opportunity_types TO service_role;
ALTER TABLE public.opportunity_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage opportunity_types" ON public.opportunity_types
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.opportunity_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'gray',
  sort_order INT NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_stages TO authenticated;
GRANT ALL ON public.opportunity_stages TO service_role;
ALTER TABLE public.opportunity_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage opportunity_stages" ON public.opportunity_stages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  owner_id UUID,
  primary_contact_id UUID,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage customers" ON public.customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  reports_to_id UUID REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  last_contact_at TIMESTAMPTZ,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_contacts_customer ON public.customer_contacts(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO authenticated;
GRANT ALL ON public.customer_contacts TO service_role;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage customer_contacts" ON public.customer_contacts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.customer_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  stage TEXT,
  probability INT NOT NULL DEFAULT 0,
  close_date DATE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  owner_id UUID,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_opportunities_customer ON public.customer_opportunities(customer_id);
CREATE INDEX idx_opportunities_stage ON public.customer_opportunities(stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_opportunities TO authenticated;
GRANT ALL ON public.customer_opportunities TO service_role;
ALTER TABLE public.customer_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage customer_opportunities" ON public.customer_opportunities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.opportunity_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.customer_opportunities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date DATE,
  invoice_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_opp_milestones_opp ON public.opportunity_milestones(opportunity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_milestones TO authenticated;
GRANT ALL ON public.opportunity_milestones TO service_role;
ALTER TABLE public.opportunity_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage opportunity_milestones" ON public.opportunity_milestones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.customer_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.customer_opportunities(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'Note',
  subject TEXT NOT NULL,
  notes TEXT,
  activity_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_activities_customer ON public.customer_activities(customer_id);
CREATE INDEX idx_customer_activities_opp ON public.customer_activities(opportunity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_activities TO authenticated;
GRANT ALL ON public.customer_activities TO service_role;
ALTER TABLE public.customer_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage customer_activities" ON public.customer_activities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.customer_opportunities(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  uploaded_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_documents_customer ON public.customer_documents(customer_id);
CREATE INDEX idx_customer_documents_opp ON public.customer_documents(opportunity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_documents TO authenticated;
GRANT ALL ON public.customer_documents TO service_role;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage customer_documents" ON public.customer_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_customer_contacts_updated_at BEFORE UPDATE ON public.customer_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_customer_opportunities_updated_at BEFORE UPDATE ON public.customer_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_opportunity_milestones_updated_at BEFORE UPDATE ON public.opportunity_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_customer_activities_updated_at BEFORE UPDATE ON public.customer_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_customer_documents_updated_at BEFORE UPDATE ON public.customer_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_opportunity_types_updated_at BEFORE UPDATE ON public.opportunity_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_opportunity_stages_updated_at BEFORE UPDATE ON public.opportunity_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.opportunity_types (name, sort_order) VALUES
  ('Upsell', 1), ('Renewal', 2), ('New', 3)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.opportunity_stages (name, color, sort_order, is_won, is_closed) VALUES
  ('Discovery',   'gray',  1, false, false),
  ('Proposal',    'blue',  2, false, false),
  ('Negotiation', 'amber', 3, false, false),
  ('Closed Won',  'green', 4, true,  true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order, is_active)
VALUES
  ('module_customers',     'Customers',     'module', NULL, 200, true),
  ('module_opportunities', 'Opportunities', 'module', NULL, 210, true)
ON CONFLICT (name) DO NOTHING;
