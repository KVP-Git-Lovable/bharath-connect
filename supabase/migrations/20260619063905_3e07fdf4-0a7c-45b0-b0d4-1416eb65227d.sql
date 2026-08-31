-- Procurement orders: allow user creation, admin/manager edit
DROP POLICY IF EXISTS "Admins manage procurement" ON public.procurement_orders;
CREATE POLICY "Users create procurement" ON public.procurement_orders FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Approvers update procurement" ON public.procurement_orders FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit') OR created_by = auth.uid())
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit') OR created_by = auth.uid());
CREATE POLICY "Approvers delete procurement" ON public.procurement_orders FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit'));

-- Procurement items
DROP POLICY IF EXISTS "Admins manage procurement items" ON public.procurement_items;
CREATE POLICY "Authenticated manage procurement items" ON public.procurement_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit') OR EXISTS (SELECT 1 FROM public.procurement_orders o WHERE o.id = procurement_id AND o.created_by = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit') OR EXISTS (SELECT 1 FROM public.procurement_orders o WHERE o.id = procurement_id AND o.created_by = auth.uid()));

-- GRN: admin/manager only (receiving)
DROP POLICY IF EXISTS "Admins manage grns" ON public.procurement_grns;
CREATE POLICY "Approvers manage grns" ON public.procurement_grns FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit'))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit'));

DROP POLICY IF EXISTS "Admins manage grn items" ON public.procurement_grn_items;
CREATE POLICY "Approvers manage grn items" ON public.procurement_grn_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit'))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit'));

DROP POLICY IF EXISTS "Admins manage invoices" ON public.procurement_invoices;
CREATE POLICY "Approvers manage invoices" ON public.procurement_invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit'))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit'));

DROP POLICY IF EXISTS "Admins manage invoice items" ON public.procurement_invoice_items;
CREATE POLICY "Approvers manage invoice items" ON public.procurement_invoice_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit'))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR can_access_object(auth.uid(),'module_procurement','edit'));