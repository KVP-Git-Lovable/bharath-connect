CREATE OR REPLACE FUNCTION public.upsert_company_profile(_payload jsonb)
RETURNS public.company_profile
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_row public.company_profile%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_object(auth.uid(), 'company_profile', 'edit')
    OR public.has_security_management_access(auth.uid(), 'edit')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_id := NULLIF(_payload->>'id','')::uuid;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.company_profile ORDER BY updated_at DESC LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.company_profile (company_name, address, phone, email, logo_url, bank_name, bank_account, bank_ifsc, gst_number, pan_number)
    VALUES (
      COALESCE(NULLIF(_payload->>'company_name',''), 'Company'),
      _payload->>'address', _payload->>'phone', _payload->>'email', _payload->>'logo_url',
      _payload->>'bank_name', _payload->>'bank_account', _payload->>'bank_ifsc',
      _payload->>'gst_number', _payload->>'pan_number'
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.company_profile SET
      company_name = COALESCE(NULLIF(_payload->>'company_name',''), company_name),
      address      = COALESCE(_payload->>'address', address),
      phone        = COALESCE(_payload->>'phone', phone),
      email        = COALESCE(_payload->>'email', email),
      logo_url     = COALESCE(_payload->>'logo_url', logo_url),
      bank_name    = COALESCE(_payload->>'bank_name', bank_name),
      bank_account = COALESCE(_payload->>'bank_account', bank_account),
      bank_ifsc    = COALESCE(_payload->>'bank_ifsc', bank_ifsc),
      gst_number   = COALESCE(_payload->>'gst_number', gst_number),
      pan_number   = COALESCE(_payload->>'pan_number', pan_number),
      updated_at   = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_company_profile(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_company_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_company_profile(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';