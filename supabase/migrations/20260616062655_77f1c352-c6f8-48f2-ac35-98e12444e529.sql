CREATE POLICY "activity_photos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'activity-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "activity_photos_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'activity-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "activity_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'activity-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "activity_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'activity-photos' AND (storage.foldername(name))[1] = auth.uid()::text);