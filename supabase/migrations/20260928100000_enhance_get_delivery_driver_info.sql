-- Migration to enhance get_delivery_driver_info RPC to coalesce profiles and drivers table data
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
    COALESCE(d.id, p.id) as id,
    COALESCE(d.user_id, p.id) as user_id,
    COALESCE(NULLIF(d.full_name, ''), NULLIF(p.full_name, ''), 'Motorista') as full_name,
    COALESCE(NULLIF(d.phone, ''), NULLIF(p.phone, ''), '') as phone,
    COALESCE(NULLIF(d.photo_url, ''), NULLIF(p.avatar_url, ''), NULLIF(p.photo_url, '')) as photo_url,
    COALESCE(NULLIF(d.driver_code, ''), CONCAT('MOT-', UPPER(SUBSTRING(COALESCE(d.user_id, p.id)::text, 1, 5)))) as driver_code,
    COALESCE(NULLIF(d.vehicle_plate, ''), 'Não informada') as vehicle_plate,
    COALESCE(NULLIF(d.vehicle_type, ''), 'Moto') as vehicle_type
  FROM public.delivery_requests req
  LEFT JOIN public.drivers d ON (d.user_id = req.driver_id OR d.id = req.driver_id)
  LEFT JOIN public.profiles p ON (p.id = req.driver_id OR p.id = d.user_id)
  WHERE req.id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_delivery_driver_info(UUID) TO authenticated, anon;
