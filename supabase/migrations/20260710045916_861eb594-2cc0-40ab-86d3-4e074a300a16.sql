
-- ============================================================
-- MASTER: Event Types
-- ============================================================
CREATE TABLE public.master_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_event_types TO authenticated;
GRANT ALL ON public.master_event_types TO service_role;
ALTER TABLE public.master_event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage master_event_types" ON public.master_event_types
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_event_types_updated_at BEFORE UPDATE ON public.master_event_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- MASTER: Lead Statuses
-- ============================================================
CREATE TABLE public.master_lead_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'gray',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_converted_status boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_lead_statuses TO authenticated;
GRANT ALL ON public.master_lead_statuses TO service_role;
ALTER TABLE public.master_lead_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage master_lead_statuses" ON public.master_lead_statuses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_lead_statuses_updated_at BEFORE UPDATE ON public.master_lead_statuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- MASTER: Lead Sources
-- ============================================================
CREATE TABLE public.master_lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_lead_sources TO authenticated;
GRANT ALL ON public.master_lead_sources TO service_role;
ALTER TABLE public.master_lead_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage master_lead_sources" ON public.master_lead_sources
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_lead_sources_updated_at BEFORE UPDATE ON public.master_lead_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- EVENTS
-- ============================================================
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_type_id uuid REFERENCES public.master_event_types(id) ON DELETE SET NULL,
  budget_amount numeric(14,2) NOT NULL DEFAULT 0,
  actual_amount numeric(14,2) NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  event_details text,
  expected_end_result text,
  owner_id uuid,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_type ON public.events(event_type_id);
CREATE INDEX idx_events_customer ON public.events(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage events" ON public.events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  name text NOT NULL,
  title text,
  company text,
  email text,
  phone text,
  website text,
  address text,
  industry text,
  lead_status_id uuid REFERENCES public.master_lead_statuses(id) ON DELETE SET NULL,
  lead_source_id uuid REFERENCES public.master_lead_sources(id) ON DELETE SET NULL,
  related_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  business_card_url text,
  converted_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  converted_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_status ON public.leads(lead_status_id);
CREATE INDEX idx_leads_source ON public.leads(lead_source_id);
CREATE INDEX idx_leads_event ON public.leads(related_event_id);
CREATE INDEX idx_leads_customer ON public.leads(converted_customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage leads" ON public.leads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- LEAD AUDIT LOG
-- ============================================================
CREATE TABLE public.lead_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_audit_lead ON public.lead_audit_log(lead_id);
GRANT SELECT ON public.lead_audit_log TO authenticated;
GRANT ALL ON public.lead_audit_log TO service_role;
ALTER TABLE public.lead_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read lead_audit_log" ON public.lead_audit_log
  FOR SELECT TO authenticated USING (true);

-- Audit trigger
CREATE OR REPLACE FUNCTION public.lead_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from text;
  v_to text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_audit_log (lead_id, actor_id, action, to_value)
    VALUES (NEW.id, auth.uid(), 'created', (SELECT name FROM public.master_lead_statuses WHERE id = NEW.lead_status_id));
  ELSIF TG_OP = 'UPDATE' AND COALESCE(NEW.lead_status_id::text,'') IS DISTINCT FROM COALESCE(OLD.lead_status_id::text,'') THEN
    SELECT name INTO v_from FROM public.master_lead_statuses WHERE id = OLD.lead_status_id;
    SELECT name INTO v_to FROM public.master_lead_statuses WHERE id = NEW.lead_status_id;
    INSERT INTO public.lead_audit_log (lead_id, actor_id, action, from_value, to_value)
    VALUES (NEW.id, auth.uid(), 'status_change', v_from, v_to);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_audit_insert AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_audit_trigger();
CREATE TRIGGER trg_lead_audit_status AFTER UPDATE OF lead_status_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_audit_trigger();

-- ============================================================
-- Extend customer_activities & customer_documents with lead_id
-- ============================================================
ALTER TABLE public.customer_activities
  ADD COLUMN lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
CREATE INDEX idx_customer_activities_lead ON public.customer_activities(lead_id);

ALTER TABLE public.customer_documents
  ADD COLUMN lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
CREATE INDEX idx_customer_documents_lead ON public.customer_documents(lead_id);

-- ============================================================
-- SEED master data
-- ============================================================
INSERT INTO public.master_event_types (name, sort_order) VALUES
  ('Trade Show', 1), ('Webinar', 2), ('Conference', 3), ('Site Visit', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.master_lead_statuses (name, color, sort_order, is_converted_status) VALUES
  ('New', 'blue', 1, false),
  ('Contacted', 'amber', 2, false),
  ('Qualified', 'green', 3, false),
  ('Unqualified', 'red', 4, false),
  ('Converted', 'purple', 5, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.master_lead_sources (name, sort_order) VALUES
  ('Event', 1), ('Referral', 2), ('Website', 3), ('Cold Call', 4), ('Campaign', 5)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- CONVERT LEAD RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.convert_lead(
  _lead_id uuid,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_customer_id uuid;
  v_merge_id uuid;
  v_converted_status uuid;
  v_account_name text;
  v_account_owner uuid;
  v_industry text;
  v_opp_name text;
  v_opp_type text;
  v_opp_stage text;
  v_opp_probability integer;
  v_opp_amount numeric;
  v_opp_close_date date;
  v_contact_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF v_lead.converted_customer_id IS NOT NULL THEN RAISE EXCEPTION 'Lead already converted'; END IF;

  v_merge_id := NULLIF(_payload->>'merge_customer_id','')::uuid;
  v_account_name := COALESCE(_payload->>'account_name', v_lead.company, v_lead.name);
  v_account_owner := COALESCE(NULLIF(_payload->>'account_owner_id','')::uuid, auth.uid());
  v_industry := COALESCE(_payload->>'industry', v_lead.industry);
  v_opp_name := COALESCE(_payload->>'opportunity_name', v_account_name || ' - Opportunity');
  v_opp_type := _payload->>'opportunity_type';
  v_opp_stage := _payload->>'opportunity_stage';
  v_opp_probability := COALESCE((_payload->>'probability')::integer, 0);
  v_opp_amount := COALESCE((_payload->>'amount')::numeric, 0);
  v_opp_close_date := NULLIF(_payload->>'close_date','')::date;
  v_contact_name := COALESCE(_payload->>'contact_name', v_lead.name);

  IF v_merge_id IS NOT NULL THEN
    v_customer_id := v_merge_id;
  ELSE
    INSERT INTO public.customers (name, industry, status, owner_id)
    VALUES (v_account_name, v_industry, 'Active', v_account_owner)
    RETURNING id INTO v_customer_id;
  END IF;

  -- Contact
  INSERT INTO public.customer_contacts (customer_id, name, title, email, phone)
  VALUES (v_customer_id, v_contact_name, v_lead.title, v_lead.email, v_lead.phone);

  -- Opportunity
  INSERT INTO public.customer_opportunities
    (customer_id, name, type, stage, probability, amount, close_date, owner_id)
  VALUES
    (v_customer_id, v_opp_name, v_opp_type, v_opp_stage, v_opp_probability, v_opp_amount, v_opp_close_date, v_account_owner);

  -- Roll up activities & documents
  UPDATE public.customer_activities SET customer_id = v_customer_id WHERE lead_id = _lead_id;
  UPDATE public.customer_documents SET customer_id = v_customer_id WHERE lead_id = _lead_id;

  -- Roll up event association (if any)
  IF v_lead.related_event_id IS NOT NULL THEN
    UPDATE public.events SET customer_id = v_customer_id WHERE id = v_lead.related_event_id AND customer_id IS NULL;
  END IF;

  -- Mark lead converted
  SELECT id INTO v_converted_status FROM public.master_lead_statuses WHERE is_converted_status = true LIMIT 1;
  UPDATE public.leads
    SET converted_customer_id = v_customer_id,
        converted_at = now(),
        lead_status_id = COALESCE(v_converted_status, lead_status_id)
    WHERE id = _lead_id;

  INSERT INTO public.lead_audit_log (lead_id, actor_id, action, to_value)
  VALUES (_lead_id, auth.uid(), 'converted', v_account_name);

  RETURN v_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_lead(uuid, jsonb) TO authenticated;
