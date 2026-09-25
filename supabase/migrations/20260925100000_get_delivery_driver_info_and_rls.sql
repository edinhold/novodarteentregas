-- Migration to ensure store owners can retrieve driver details (name, phone, photo, license plate) for assigned deliveries
CREATE OR REPLACE FUNCTION public.get_delivery_driver_info(p_request_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  full_name TEXT,
  phone TEXT,
  photo_url TEXT,
  driver_code TEXT,
  vehicle_plate TEXT,
  vehicle_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.user_id,
    d.full_name,
    d.phone,
    d.photo_url,
    d.driver_code,
    d.vehicle_plate,
    d.vehicle_type
  FROM public.delivery_requests req
  JOIN public.drivers d ON d.user_id = req.driver_id OR d.id = req.driver_id
  WHERE req.id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_delivery_driver_info(UUID) TO authenticated, anon;

-- Policy to allow store owners to SELECT from drivers table when assigned to their delivery requests
DROP POLICY IF EXISTS "Store owners can view drivers assigned to their deliveries" ON public.drivers;
CREATE POLICY "Store owners can view drivers assigned to their deliveries"
  ON public.drivers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_requests req
      WHERE (req.store_owner_id = auth.uid() OR req.driver_id = drivers.user_id OR req.driver_id = drivers.id)
    )
  );
