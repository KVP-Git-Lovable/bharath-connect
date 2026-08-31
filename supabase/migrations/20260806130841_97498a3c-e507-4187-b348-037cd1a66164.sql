
DROP VIEW IF EXISTS public.company_branding;

REVOKE SELECT ON public.company_profile FROM anon;
GRANT SELECT (id, company_name, logo_url, updated_at) ON public.company_profile TO anon;

DROP POLICY IF EXISTS "Public can view company branding" ON public.company_profile;
CREATE POLICY "Public can view company branding"
  ON public.company_profile FOR SELECT TO anon
  USING (true);
