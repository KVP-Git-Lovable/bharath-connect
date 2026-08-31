
-- 1. COMPANY PROFILE: remove anon access to full row, expose branding-only view
DROP POLICY IF EXISTS "Public can view company branding" ON public.company_profile;

CREATE OR REPLACE VIEW public.company_branding AS
  SELECT id, company_name, logo_url, updated_at
  FROM public.company_profile;

GRANT SELECT ON public.company_branding TO anon, authenticated;

-- 2. CRM ACCESS HELPERS
CREATE OR REPLACE FUNCTION public.can_access_crm_record(_owner uuid, _creator uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = _owner
    OR auth.uid() = _creator
    OR (_owner IS NULL AND _creator IS NULL)
    OR EXISTS (
      SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h
      WHERE h.user_id = _owner OR h.user_id = _creator
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_customer(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    _customer_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = _customer_id
        AND public.can_access_crm_record(c.owner_id, c.created_by)
    )
  )
$$;

-- customers
DROP POLICY IF EXISTS "Authenticated can manage customers" ON public.customers;
CREATE POLICY "Owners managers and admins manage customers"
  ON public.customers FOR ALL TO authenticated
  USING (public.can_access_crm_record(owner_id, created_by))
  WITH CHECK (public.can_access_crm_record(owner_id, created_by));

-- leads
DROP POLICY IF EXISTS "Authenticated can manage leads" ON public.leads;
CREATE POLICY "Owners managers and admins manage leads"
  ON public.leads FOR ALL TO authenticated
  USING (public.can_access_crm_record(owner_id, created_by))
  WITH CHECK (public.can_access_crm_record(owner_id, created_by));

-- customer_opportunities
DROP POLICY IF EXISTS "Authenticated can manage customer_opportunities" ON public.customer_opportunities;
CREATE POLICY "Owners managers and admins manage opportunities"
  ON public.customer_opportunities FOR ALL TO authenticated
  USING (public.can_access_crm_record(owner_id, created_by) OR public.can_access_customer(customer_id))
  WITH CHECK (public.can_access_crm_record(owner_id, created_by) OR public.can_access_customer(customer_id));

-- customer_contacts
DROP POLICY IF EXISTS "Authenticated can manage customer_contacts" ON public.customer_contacts;
CREATE POLICY "Owners managers and admins manage customer contacts"
  ON public.customer_contacts FOR ALL TO authenticated
  USING (public.can_access_crm_record(NULL, created_by) OR public.can_access_customer(customer_id))
  WITH CHECK (public.can_access_crm_record(NULL, created_by) OR public.can_access_customer(customer_id));

-- customer_activities
DROP POLICY IF EXISTS "Authenticated can manage customer_activities" ON public.customer_activities;
CREATE POLICY "Owners managers and admins manage customer activities"
  ON public.customer_activities FOR ALL TO authenticated
  USING (
    public.can_access_crm_record(NULL, created_by)
    OR public.can_access_customer(customer_id)
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = lead_id
        AND public.can_access_crm_record(l.owner_id, l.created_by)))
  )
  WITH CHECK (
    public.can_access_crm_record(NULL, created_by)
    OR public.can_access_customer(customer_id)
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = lead_id
        AND public.can_access_crm_record(l.owner_id, l.created_by)))
  );

-- customer_documents
DROP POLICY IF EXISTS "Authenticated can manage customer_documents" ON public.customer_documents;
CREATE POLICY "Owners managers and admins manage customer documents"
  ON public.customer_documents FOR ALL TO authenticated
  USING (
    public.can_access_customer(customer_id)
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = lead_id
        AND public.can_access_crm_record(l.owner_id, l.created_by)))
  )
  WITH CHECK (
    public.can_access_customer(customer_id)
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = lead_id
        AND public.can_access_crm_record(l.owner_id, l.created_by)))
  );

-- 3. master_activity_outcomes: use has_role instead of unverified JWT claim
DROP POLICY IF EXISTS "admin_can_manage_outcomes" ON public.master_activity_outcomes;
CREATE POLICY "admin_can_manage_outcomes"
  ON public.master_activity_outcomes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "anyone_can_read_outcomes" ON public.master_activity_outcomes;
CREATE POLICY "authenticated_can_read_outcomes"
  ON public.master_activity_outcomes FOR SELECT TO authenticated
  USING (true);

-- 4. users table: limit broad read
DROP POLICY IF EXISTS "Authenticated can view active users" ON public.users;
CREATE POLICY "Users managers and admins can view users"
  ON public.users FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR reporting_manager_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h WHERE h.user_id = users.id)
    OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(users.id) h WHERE h.user_id = auth.uid())
  );

-- 5. STORAGE POLICIES
-- activity-audio: no public read
DROP POLICY IF EXISTS "Public read activity audio" ON storage.objects;
CREATE POLICY "Owners managers and admins read activity audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'activity-audio'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h
                 WHERE h.user_id::text = (storage.foldername(name))[1])
    )
  );

-- temp-downloads: owner-only read
DROP POLICY IF EXISTS "Anyone can read temp downloads" ON storage.objects;
CREATE POLICY "Users read own temp downloads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'temp-downloads' AND (storage.foldername(name))[1] = auth.uid()::text);

-- employee-photos: owner / manager / admin read
DROP POLICY IF EXISTS "Users can view own employee photos" ON storage.objects;
CREATE POLICY "Users managers and admins read employee photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h
                 WHERE h.user_id::text = (storage.foldername(name))[1])
    )
  );

-- grn-photos
DROP POLICY IF EXISTS "Authenticated can read grn photos" ON storage.objects;
CREATE POLICY "Owners managers and admins read grn photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'grn-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h
                 WHERE h.user_id::text = (storage.foldername(name))[1])
    )
  );

-- invoice-attachments
DROP POLICY IF EXISTS "Authenticated read invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete invoice files" ON storage.objects;
CREATE POLICY "Owners and admins read invoice files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR owner = auth.uid()
         OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );
CREATE POLICY "Owners and admins delete invoice files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR owner = auth.uid()
         OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- site-attachments: shared read for authenticated, owner/admin write
DROP POLICY IF EXISTS "Authenticated update site attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete site attachments" ON storage.objects;
CREATE POLICY "Owners and admins update site attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'site-attachments'
         AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Owners and admins delete site attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-attachments'
         AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)));

-- pm-attachments
DROP POLICY IF EXISTS "Users can delete own pm attachments" ON storage.objects;
CREATE POLICY "Owners and admins delete pm attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pm-attachments'
         AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)));

-- customer-documents: owner/admin write
DROP POLICY IF EXISTS "Authenticated can delete customer documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update customer documents" ON storage.objects;
CREATE POLICY "Owners and admins delete customer documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'customer-documents'
         AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Owners and admins update customer documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'customer-documents'
         AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)));

-- 6. FUNCTION EXECUTE PRIVILEGES: block signed-out callers
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION
  public.has_role(uuid, public.app_role),
  public.get_user_role(uuid),
  public.can_access_object(uuid, text, text),
  public.has_security_management_access(uuid, text),
  public.can_access_crm_record(uuid, uuid),
  public.can_access_customer(uuid),
  public.get_user_hierarchy(uuid),
  public.get_subordinate_users(uuid),
  public.get_dashboard_summary(),
  public.get_monthly_expense_summary(uuid, text),
  public.report_device_status(integer, boolean, text, text),
  public.ensure_current_user(text, text, text),
  public.convert_lead(uuid, jsonb),
  public.send_notification(uuid, text, text, text, text, uuid),
  public.recalculate_monthly_leave_accruals(uuid)
TO authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
