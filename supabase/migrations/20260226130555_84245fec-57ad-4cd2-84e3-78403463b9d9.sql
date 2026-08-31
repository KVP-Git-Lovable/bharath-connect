
-- Add onboarding_completed column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Allow users to upload their own photos to employee-photos bucket
CREATE POLICY "Users can upload own employee photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'employee-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own employee photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'employee-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to upload to attendance-photos bucket  
CREATE POLICY "Users can upload attendance photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'attendance-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
