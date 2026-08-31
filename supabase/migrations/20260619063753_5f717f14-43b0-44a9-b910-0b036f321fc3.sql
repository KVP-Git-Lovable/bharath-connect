-- Product Master: default UOM
ALTER TABLE public.master_products ADD COLUMN IF NOT EXISTS default_uom text;

-- Procurement orders: new fields
ALTER TABLE public.procurement_orders ADD COLUMN IF NOT EXISTS expected_delivery_date date;
ALTER TABLE public.procurement_orders ADD COLUMN IF NOT EXISTS payment_terms text;

-- Procurement items: UOM
ALTER TABLE public.procurement_items ADD COLUMN IF NOT EXISTS uom text;

-- GRN number sequence
CREATE SEQUENCE IF NOT EXISTS public.grn_number_seq;

-- GRN header table
CREATE TABLE public.procurement_grns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id uuid NOT NULL REFERENCES public.procurement_orders(id) ON DELETE CASCADE,
  grn_number text UNIQUE,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  received_by text,
  status text NOT NULL DEFAULT 'Pending',
  remarks text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_grns TO authenticated;
GRANT ALL ON public.procurement_grns TO service_role;
ALTER TABLE public.procurement_grns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read grns" ON public.procurement_grns FOR SELECT USING (true);
CREATE POLICY "Admins manage grns" ON public.procurement_grns FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- GRN line items
CREATE TABLE public.procurement_grn_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_id uuid NOT NULL REFERENCES public.procurement_grns(id) ON DELETE CASCADE,
  procurement_item_id uuid REFERENCES public.procurement_items(id) ON DELETE SET NULL,
  product_id uuid,
  ordered_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_grn_items TO authenticated;
GRANT ALL ON public.procurement_grn_items TO service_role;
ALTER TABLE public.procurement_grn_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read grn items" ON public.procurement_grn_items FOR SELECT USING (true);
CREATE POLICY "Admins manage grn items" ON public.procurement_grn_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Invoices
CREATE TABLE public.procurement_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id uuid NOT NULL REFERENCES public.procurement_orders(id) ON DELETE CASCADE,
  invoice_number text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  invoice_amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_invoices TO authenticated;
GRANT ALL ON public.procurement_invoices TO service_role;
ALTER TABLE public.procurement_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read invoices" ON public.procurement_invoices FOR SELECT USING (true);
CREATE POLICY "Admins manage invoices" ON public.procurement_invoices FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Invoice line items (per-item rate matching)
CREATE TABLE public.procurement_invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.procurement_invoices(id) ON DELETE CASCADE,
  procurement_item_id uuid REFERENCES public.procurement_items(id) ON DELETE SET NULL,
  product_id uuid,
  invoiced_rate numeric NOT NULL DEFAULT 0,
  invoiced_qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_invoice_items TO authenticated;
GRANT ALL ON public.procurement_invoice_items TO service_role;
ALTER TABLE public.procurement_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read invoice items" ON public.procurement_invoice_items FOR SELECT USING (true);
CREATE POLICY "Admins manage invoice items" ON public.procurement_invoice_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Auto-generate GRN number
CREATE OR REPLACE FUNCTION public.set_grn_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.grn_number IS NULL THEN
    NEW.grn_number := 'GRN-' || lpad(nextval('public.grn_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_set_grn_number BEFORE INSERT ON public.procurement_grns
FOR EACH ROW EXECUTE FUNCTION public.set_grn_number();

-- updated_at triggers
CREATE TRIGGER trg_grns_updated_at BEFORE UPDATE ON public.procurement_grns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_grn_items_updated_at BEFORE UPDATE ON public.procurement_grn_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.procurement_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();