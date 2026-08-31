-- 1. company_profile
DROP POLICY IF EXISTS "Anon can view company branding columns" ON public.company_profile;
DROP POLICY IF EXISTS "Anyone can view company profile" ON public.company_profile;
CREATE POLICY "Managers can view company profile"
ON public.company_profile FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_object(auth.uid(), 'company_profile', 'read')
  OR public.can_access_object(auth.uid(), 'company_profile', 'edit')
);

CREATE OR REPLACE VIEW public.company_branding
WITH (security_invoker = false) AS
SELECT id, company_name, logo_url, address, updated_at
FROM public.company_profile;
GRANT SELECT ON public.company_branding TO anon, authenticated;

-- 2. attendance
DROP POLICY IF EXISTS "Authenticated can view today's attendance" ON public.attendance;

-- 3. lead_audit_log
DROP POLICY IF EXISTS "Authenticated can read lead_audit_log" ON public.lead_audit_log;
CREATE POLICY "Users can read audit for accessible leads"
ON public.lead_audit_log FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_audit_log.lead_id
      AND public.can_access_crm_record(l.owner_id, l.created_by)
  )
);

-- 4. master_addresses
DROP POLICY IF EXISTS "Authenticated can view addresses" ON public.master_addresses;
CREATE POLICY "Procurement users can view addresses"
ON public.master_addresses FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_object(auth.uid(), 'module_procurement', 'read')
  OR public.can_access_object(auth.uid(), 'module_procurement', 'edit')
);

-- 5. opportunity quotes
DROP POLICY IF EXISTS "auth read quotes" ON public.opportunity_quotes;
CREATE POLICY "Users can read accessible quotes"
ON public.opportunity_quotes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.customer_opportunities o
    WHERE o.id = opportunity_quotes.opportunity_id
      AND (public.can_access_crm_record(o.owner_id, o.owner_id)
           OR public.can_access_customer(o.customer_id))
  )
);

DROP POLICY IF EXISTS "auth read quote items" ON public.opportunity_quote_items;
CREATE POLICY "Users can read accessible quote items"
ON public.opportunity_quote_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.opportunity_quotes q
    JOIN public.customer_opportunities o ON o.id = q.opportunity_id
    WHERE q.id = opportunity_quote_items.quote_id
      AND (public.can_access_crm_record(o.owner_id, o.owner_id)
           OR public.can_access_customer(o.customer_id))
  )
);

-- 6. procurement financial tables
DROP POLICY IF EXISTS "Authenticated can read invoices" ON public.procurement_invoices;
CREATE POLICY "Procurement users can read invoices" ON public.procurement_invoices FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'read') OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

DROP POLICY IF EXISTS "Authenticated can read invoice items" ON public.procurement_invoice_items;
CREATE POLICY "Procurement users can read invoice items" ON public.procurement_invoice_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'read') OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

DROP POLICY IF EXISTS "Authenticated can read invoice payments" ON public.procurement_invoice_payments;
CREATE POLICY "Procurement users can read invoice payments" ON public.procurement_invoice_payments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'read') OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

DROP POLICY IF EXISTS "Authenticated can read invoice attachments" ON public.procurement_invoice_attachments;
CREATE POLICY "Procurement users can read invoice attachments" ON public.procurement_invoice_attachments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'read') OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

DROP POLICY IF EXISTS "Authenticated can read grns" ON public.procurement_grns;
CREATE POLICY "Procurement users can read grns" ON public.procurement_grns FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'read') OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

DROP POLICY IF EXISTS "Authenticated can read grn items" ON public.procurement_grn_items;
CREATE POLICY "Procurement users can read grn items" ON public.procurement_grn_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'read') OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

DROP POLICY IF EXISTS "Authenticated can view vendor feedback" ON public.procurement_vendor_feedback;
CREATE POLICY "Procurement users can view vendor feedback" ON public.procurement_vendor_feedback FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_object(auth.uid(), 'module_procurement', 'read') OR public.can_access_object(auth.uid(), 'module_procurement', 'edit'));

-- 7. privilege escalation fix
CREATE OR REPLACE FUNCTION public.has_security_management_access(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::public.app_role)
      OR public.can_access_object(_user_id, 'security', _permission)
    )
$function$;

-- 8. lock down internal trigger functions
REVOKE ALL ON FUNCTION public.auto_init_leave_balances() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.lead_audit_trigger() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_opportunity_amount_from_quote() FROM anon, authenticated;
