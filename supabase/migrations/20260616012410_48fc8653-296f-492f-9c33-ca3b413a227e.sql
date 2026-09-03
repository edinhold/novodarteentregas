GRANT SELECT (
  id,
  name,
  image,
  logo,
  address,
  latitude,
  longitude,
  category_id,
  category_name,
  rating,
  delivery_time,
  delivery_fee,
  min_order,
  distance,
  is_open,
  is_featured,
  created_at,
  updated_at
) ON public.restaurants TO anon;

GRANT SELECT ON public.restaurants TO authenticated;
GRANT SELECT ON public.restaurants_public TO anon, authenticated;
GRANT ALL ON public.restaurants TO service_role;