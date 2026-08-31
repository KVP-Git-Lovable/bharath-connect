DROP VIEW IF EXISTS public.company_branding;

REVOKE SELECT ON public.company_profile FROM anon, authenticated;
GRANT SELECT (id, company_name, logo_url, address, updated_at) ON public.company_profile TO anon, authenticated;
GRANT ALL ON public.company_profile TO service_role;

DROP POLICY IF EXISTS "Managers can view company profile" ON public.company_profile;
CREATE POLICY "Branding columns are readable"
ON public.company_profile FOR SELECT TO anon, authenticated
USING (true);

CREATE OR REPLACE VIEW public.company_branding
WITH (security_invoker = true) AS
SELECT id, company_name, logo_url, address, updated_at
FROM public.company_profile;
GRANT SELECT ON public.company_branding TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_company_profile_full()
RETURNS SETOF public.company_profile
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'company_profile', 'read')
    OR public.can_access_object(auth.uid(), 'company_profile', 'edit')
    OR public.has_security_management_access(auth.uid(), 'edit')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT * FROM public.company_profile ORDER BY updated_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_company_profile_full() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_company_profile_full() TO authenticated, service_role;
