GRANT SELECT ON public.company_profile TO anon;
DROP POLICY IF EXISTS "Public can view company branding" ON public.company_profile;
CREATE POLICY "Public can view company branding" ON public.company_profile FOR SELECT TO anon USING (true);