
-- Create public bucket for restaurant images
INSERT INTO storage.buckets (id, name, public) VALUES ('restaurant-images', 'restaurant-images', true);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload restaurant images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'restaurant-images');

-- Allow public read access
CREATE POLICY "Public can view restaurant images"
ON storage.objects FOR SELECT
USING (bucket_id = 'restaurant-images');

-- Allow owners to update/delete their uploads
CREATE POLICY "Users can update own restaurant images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'restaurant-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own restaurant images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'restaurant-images' AND (storage.foldername(name))[1] = auth.uid()::text);
