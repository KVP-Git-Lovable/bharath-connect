-- Add photos column to procurement_grns to store delivery proof photo paths
ALTER TABLE public.procurement_grns
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- RLS policies for grn-photos bucket
CREATE POLICY "Authenticated can read grn photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'grn-photos');

CREATE POLICY "Authenticated can upload grn photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'grn-photos');

CREATE POLICY "Authenticated can update own grn photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'grn-photos' AND owner = auth.uid());

CREATE POLICY "Authenticated can delete own grn photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'grn-photos' AND owner = auth.uid());