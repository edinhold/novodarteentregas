
-- 1) Drivers: remove broad store-owner SELECT policies that expose sensitive columns
DROP POLICY IF EXISTS "Restaurant owners can view assigned drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers are visible to authenticated for mapping" ON public.drivers;

-- Keep driver_locations radar access intact (uses is_store_owner_of_driver on driver_locations only).

-- 2) delivery_requests: tighten driver acceptance to active drivers only
DROP POLICY IF EXISTS "Drivers can accept or update their requests" ON public.delivery_requests;
CREATE POLICY "Drivers can accept or update their requests"
ON public.delivery_requests
FOR UPDATE
USING (
  (
    status = 'pending'
    AND driver_id IS NULL
    AND has_role(auth.uid(), 'driver'::app_role)
    AND EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = auth.uid() AND d.is_active = true)
  )
  OR driver_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (
    driver_id = auth.uid()
    AND status IN ('accepted','picked_up')
    AND EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = auth.uid() AND d.is_active = true)
  )
  OR (driver_id IS NULL AND status = 'pending')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 3) restaurants: hide owner_id from anon (and unauth) callers via column-level grants
REVOKE SELECT ON public.restaurants FROM anon;
GRANT SELECT (
  id, name, image, logo, address, latitude, longitude,
  category_id, category_name, rating, delivery_time, delivery_fee,
  min_order, distance, is_open, is_featured, created_at, updated_at
) ON public.restaurants TO anon;

-- authenticated keeps full row access (policies still gate ownership for writes)
GRANT SELECT ON public.restaurants TO authenticated;
