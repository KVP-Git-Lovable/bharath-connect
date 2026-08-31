CREATE POLICY "Authenticated read site attachments" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'site-attachments');
CREATE POLICY "Authenticated upload site attachments" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-attachments');
CREATE POLICY "Authenticated update site attachments" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'site-attachments');
CREATE POLICY "Authenticated delete site attachments" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'site-attachments');