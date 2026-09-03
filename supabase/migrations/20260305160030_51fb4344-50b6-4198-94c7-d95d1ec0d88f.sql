
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS photo_url text DEFAULT NULL;

INSERT INTO storage.buckets (id, name, public) VALUES ('driver-photos', 'driver-photos', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view driver photos" ON storage.objects FOR SELECT USING (bucket_id = 'driver-photos');
CREATE POLICY "Authenticated can upload driver photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'driver-photos' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update own driver photos" ON storage.objects FOR UPDATE USING (bucket_id = 'driver-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own driver photos" ON storage.objects FOR DELETE USING (bucket_id = 'driver-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
