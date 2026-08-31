DROP POLICY IF EXISTS "activity_photos_select_own" ON storage.objects;

CREATE POLICY "activity_photos_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'activity-photos');