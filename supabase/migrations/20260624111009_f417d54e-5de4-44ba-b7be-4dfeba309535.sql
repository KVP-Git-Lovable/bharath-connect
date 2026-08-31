CREATE TABLE public.procurement_invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.procurement_invoices(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint,
  file_path text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_invoice_attachments TO authenticated;
GRANT ALL ON public.procurement_invoice_attachments TO service_role;

ALTER TABLE public.procurement_invoice_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read invoice attachments"
  ON public.procurement_invoice_attachments FOR SELECT
  USING (true);

CREATE POLICY "Approvers manage invoice attachments"
  ON public.procurement_invoice_attachments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR can_access_object(auth.uid(), 'module_procurement'::text, 'edit'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR can_access_object(auth.uid(), 'module_procurement'::text, 'edit'::text));

CREATE TABLE public.procurement_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.procurement_invoices(id) ON DELETE CASCADE,
  reference_number text,
  bank_name text,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_invoice_payments TO authenticated;
GRANT ALL ON public.procurement_invoice_payments TO service_role;

ALTER TABLE public.procurement_invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read invoice payments"
  ON public.procurement_invoice_payments FOR SELECT
  USING (true);

CREATE POLICY "Approvers manage invoice payments"
  ON public.procurement_invoice_payments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR can_access_object(auth.uid(), 'module_procurement'::text, 'edit'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR can_access_object(auth.uid(), 'module_procurement'::text, 'edit'::text));

CREATE POLICY "Authenticated read invoice files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-attachments');

CREATE POLICY "Authenticated upload invoice files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-attachments');

CREATE POLICY "Authenticated delete invoice files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-attachments');