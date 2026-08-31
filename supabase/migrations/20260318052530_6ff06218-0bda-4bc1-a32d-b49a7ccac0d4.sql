
-- Create storage bucket for activity audio recordings
INSERT INTO storage.buckets (id, name, public) VALUES ('activity-audio', 'activity-audio', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to their own folder
CREATE POLICY "Users can upload activity audio" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'activity-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: anyone can read (public bucket)
CREATE POLICY "Public read activity audio" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'activity-audio');

-- RLS: users can delete their own audio
CREATE POLICY "Users can delete own activity audio" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'activity-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
