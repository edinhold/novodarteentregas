-- 1. Fix delivery_requests UPDATE: restrict to drivers only with WITH CHECK
DROP POLICY IF EXISTS "Drivers can accept requests" ON public.delivery_requests;
CREATE POLICY "Drivers can accept or update their requests"
  ON public.delivery_requests FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'driver'::app_role)
    AND (status = 'pending' OR driver_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'driver'::app_role)
    AND driver_id = auth.uid()
  );

-- 2. Fix storage INSERT: scope uploads to own folder
DROP POLICY IF EXISTS "Authenticated users can upload restaurant images" ON storage.objects;
CREATE POLICY "Authenticated users can upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );