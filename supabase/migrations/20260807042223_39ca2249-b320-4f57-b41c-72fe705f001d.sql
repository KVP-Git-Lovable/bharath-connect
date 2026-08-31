-- 1. company_profile: anon may only read branding columns
DROP POLICY IF EXISTS "Public can view company branding" ON public.company_profile;
REVOKE SELECT ON public.company_profile FROM anon;
GRANT SELECT (company_name, logo_url) ON public.company_profile TO anon;
CREATE POLICY "Anon can view company branding columns"
  ON public.company_profile FOR SELECT TO anon USING (true);

-- 2. storage: customer-documents ownership / record based access
DROP POLICY IF EXISTS "cust_docs_read" ON storage.objects;
DROP POLICY IF EXISTS "cust_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "cust_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "cust_docs_delete" ON storage.objects;

CREATE POLICY "Owners admins and related users read customer documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-documents'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.customer_documents d WHERE d.file_url = storage.objects.name)
    )
  );

CREATE POLICY "Authenticated upload customer documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-documents' AND auth.uid() IS NOT NULL);

-- 3. storage: pm-attachments
DROP POLICY IF EXISTS "Authenticated can view pm attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload pm attachments" ON storage.objects;

CREATE POLICY "Owners admins and related users read pm attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pm-attachments'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.pm_task_attachments a WHERE a.file_url = storage.objects.name)
      OR EXISTS (SELECT 1 FROM public.pm_template_attachments a WHERE a.file_url = storage.objects.name)
    )
  );

CREATE POLICY "Authenticated upload pm attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pm-attachments' AND auth.uid() IS NOT NULL);

-- 4. storage: site-attachments
DROP POLICY IF EXISTS "Authenticated read site attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload site attachments" ON storage.objects;

CREATE POLICY "Owners admins and related users read site attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'site-attachments'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.project_sites p
        WHERE p.attachment_urls::text LIKE '%' || storage.objects.name || '%'
      )
    )
  );

CREATE POLICY "Authenticated upload site attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-attachments' AND auth.uid() IS NOT NULL);

-- 5. storage: activity-photos owner / manager / admin only
DROP POLICY IF EXISTS "activity_photos_select_auth" ON storage.objects;
CREATE POLICY "Owners managers and admins read activity photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'activity-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h
        WHERE h.user_id::text = (storage.foldername(storage.objects.name))[1]
      )
    )
  );

-- 6. storage: branding bucket public read (logo shown on login screen)
CREATE POLICY "Public can read branding assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'branding');
CREATE POLICY "Admins manage branding assets"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 7. Lock down directly-callable internal / trigger functions
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.auto_init_leave_balances()',
    'public.check_vendor_phone_unique()',
    'public.handle_new_user()',
    'public.lead_audit_trigger()',
    'public.opportunity_stage_change_trigger()',
    'public.set_activity_code()',
    'public.set_grn_number()',
    'public.set_po_number()',
    'public.sync_opportunity_amount_from_quote()',
    'public.update_updated_at_column()',
    'public.validate_site_milestone()',
    'public.get_subordinate_users(uuid)',
    'public.get_user_role(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- anon may not execute any public function
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;