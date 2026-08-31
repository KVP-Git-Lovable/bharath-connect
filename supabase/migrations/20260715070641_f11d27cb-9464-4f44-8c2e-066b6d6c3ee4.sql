-- Keep only the newest company_profile row
DELETE FROM public.company_profile
WHERE id NOT IN (
  SELECT id FROM public.company_profile ORDER BY updated_at DESC NULLS LAST LIMIT 1
);
