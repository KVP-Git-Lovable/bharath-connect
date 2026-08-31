CREATE POLICY "Anyone can read the company logo file"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'employee-photos'
    AND (storage.foldername(name))[1] = 'company-logo'
  );