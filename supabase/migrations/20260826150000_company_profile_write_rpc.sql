-- The Aug 13 security-hardening migration (20260813093601) revoked ALL
-- table privileges on company_profile from anon/authenticated, but only
-- added a read-side replacement (get_company_profile_full()). The write
-- side was never given an equivalent, so the admin Company Profile page's
-- direct `.update()`/`.insert()` calls against the table have been failing
-- with "permission denied for table company_profile" ever since.
--
-- Add a SECURITY DEFINER write RPC mirroring get_company_profile_full()'s
-- authorization check, and let the client call it instead of touching the
-- table directly.
CREATE OR REPLACE FUNCTION public.upsert_company_profile(_payload jsonb)
RETURNS public.company_profile
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid := NULLIF(_payload->>'id', '')::uuid;
  v_row public.company_profile;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'company_profile', 'edit')
    OR public.has_security_management_access(auth.uid(), 'edit')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.company_profile SET
      company_name = COALESCE(_payload->>'company_name', company_name),
      logo_url     = COALESCE(_payload->>'logo_url', logo_url),
      address      = COALESCE(_payload->>'address', address),
      email        = COALESCE(_payload->>'email', email),
      phone        = COALESCE(_payload->>'phone', phone),
      gst_number   = COALESCE(_payload->>'gst_number', gst_number),
      pan_number   = COALESCE(_payload->>'pan_number', pan_number),
      bank_name    = COALESCE(_payload->>'bank_name', bank_name),
      bank_account = COALESCE(_payload->>'bank_account', bank_account),
      bank_ifsc    = COALESCE(_payload->>'bank_ifsc', bank_ifsc),
      updated_at   = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.company_profile (
      company_name, logo_url, address, email, phone, gst_number, pan_number, bank_name, bank_account, bank_ifsc
    ) VALUES (
      _payload->>'company_name', _payload->>'logo_url', _payload->>'address', _payload->>'email',
      _payload->>'phone', _payload->>'gst_number', _payload->>'pan_number', _payload->>'bank_name',
      _payload->>'bank_account', _payload->>'bank_ifsc'
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_company_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_company_profile(jsonb) TO authenticated, service_role;
