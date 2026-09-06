-- Migration for store logo and profile security policies

-- 1. Ensure RLS is enabled on restaurants table
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- 2. Ensure store owners can only update their own restaurant
DROP POLICY IF EXISTS "Owners can update their restaurant" ON public.restaurants;
CREATE POLICY "Owners can update their restaurant"
  ON public.restaurants FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 3. Ensure storage policies for restaurant-images bucket
-- Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-images', 'restaurant-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to upload to restaurant-images under their own user_id folder
DROP POLICY IF EXISTS "Authenticated users can upload restaurant images" ON storage.objects;
CREATE POLICY "Authenticated users can upload restaurant images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-images' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update their own uploads
DROP POLICY IF EXISTS "Users can update own restaurant images" ON storage.objects;
CREATE POLICY "Users can update own restaurant images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'restaurant-images' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own uploads
DROP POLICY IF EXISTS "Users can delete own restaurant images" ON storage.objects;
CREATE POLICY "Users can delete own restaurant images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'restaurant-images' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public view policy for restaurant-images
DROP POLICY IF EXISTS "Public can view restaurant images" ON storage.objects;
CREATE POLICY "Public can view restaurant images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'restaurant-images');
