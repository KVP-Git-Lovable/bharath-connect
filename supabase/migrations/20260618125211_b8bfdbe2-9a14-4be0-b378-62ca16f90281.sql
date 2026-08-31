
-- Reusable updated_at trigger function already exists: public.update_updated_at_column()

-- ===== Category Master =====
CREATE TABLE public.master_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name text NOT NULL,
  sub_category_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_categories TO authenticated;
GRANT ALL ON public.master_categories TO service_role;
ALTER TABLE public.master_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read categories" ON public.master_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage categories" ON public.master_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_master_categories_updated BEFORE UPDATE ON public.master_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Product Master =====
CREATE TABLE public.master_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  category_id uuid REFERENCES public.master_categories(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_products TO authenticated;
GRANT ALL ON public.master_products TO service_role;
ALTER TABLE public.master_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read products" ON public.master_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage products" ON public.master_products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_master_products_updated BEFORE UPDATE ON public.master_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Entity Master =====
CREATE TABLE public.master_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name text NOT NULL,
  entity_code text,
  address text,
  gst_number text,
  contact_person text,
  contact_number text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_entities TO authenticated;
GRANT ALL ON public.master_entities TO service_role;
ALTER TABLE public.master_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read entities" ON public.master_entities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage entities" ON public.master_entities FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_master_entities_updated BEFORE UPDATE ON public.master_entities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Procurement Orders =====
CREATE TABLE public.procurement_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  po_number text,
  site_id uuid REFERENCES public.project_sites(id) ON DELETE SET NULL,
  entity_id uuid REFERENCES public.master_entities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Draft',
  grn_number text,
  grn_status text,
  total_amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_orders TO authenticated;
GRANT ALL ON public.procurement_orders TO service_role;
ALTER TABLE public.procurement_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read procurement" ON public.procurement_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage procurement" ON public.procurement_orders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_procurement_orders_updated BEFORE UPDATE ON public.procurement_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Procurement Items =====
CREATE TABLE public.procurement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id uuid NOT NULL REFERENCES public.procurement_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.master_products(id) ON DELETE SET NULL,
  rate numeric NOT NULL DEFAULT 0,
  qty numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_items TO authenticated;
GRANT ALL ON public.procurement_items TO service_role;
ALTER TABLE public.procurement_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read procurement items" ON public.procurement_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage procurement items" ON public.procurement_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_procurement_items_updated BEFORE UPDATE ON public.procurement_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Permission module for Procurement =====
INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order, is_active)
VALUES ('module_procurement', 'Procurement', 'module', NULL, 100, true)
ON CONFLICT DO NOTHING;
