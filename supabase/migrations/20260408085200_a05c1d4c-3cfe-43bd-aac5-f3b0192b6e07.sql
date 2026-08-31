CREATE POLICY "Admins can view all attendance photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attendance-photos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);