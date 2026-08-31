
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-downloads',
  'temp-downloads',
  true,
  52428800,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload temp downloads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'temp-downloads');

CREATE POLICY "Anyone can read temp downloads"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'temp-downloads');

CREATE POLICY "Users can delete own temp downloads"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'temp-downloads' AND (storage.foldername(name))[1] = auth.uid()::text);
