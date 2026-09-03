
-- 1) Remove the overly broad store_owner policy that exposed sensitive columns
DROP POLICY IF EXISTS "Store owners can view active drivers" ON public.drivers;

-- 2) Safe radar function: returns only non-sensitive driver fields to store owners/admins
CREATE OR REPLACE FUNCTION public.get_radar_drivers()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  full_name text,
  driver_code text,
  vehicle_plate text,
  vehicle_type text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.user_id, d.full_name, d.driver_code, d.vehicle_plate, d.vehicle_type, d.is_active
  FROM public.drivers d
  WHERE d.is_active = true
    AND (
      public.has_role(auth.uid(), 'store_owner'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    );
$$;

REVOKE ALL ON FUNCTION public.get_radar_drivers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_radar_drivers() TO authenticated;

-- 3) Remove owner_id from anon-readable columns on restaurants
REVOKE SELECT ON public.restaurants FROM anon;
GRANT SELECT (
  id, name, image, logo, category_id, category_name, rating,
  delivery_time, delivery_fee, min_order, distance,
  is_open, is_featured, address, latitude, longitude,
  created_at, updated_at
) ON public.restaurants TO anon;
