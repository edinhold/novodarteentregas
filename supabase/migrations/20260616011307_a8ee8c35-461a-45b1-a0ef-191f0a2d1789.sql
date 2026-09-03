
-- 1) driver_locations: drop overly broad store_owner SELECT policy
DROP POLICY IF EXISTS "Store owners can view driver locations" ON public.driver_locations;

-- 2) restaurants: stop returning owner_id to anon
-- Replace the public SELECT policy with an authenticated-only one
DROP POLICY IF EXISTS "Restaurants are viewable by everyone" ON public.restaurants;
CREATE POLICY "Authenticated can view restaurants"
ON public.restaurants
FOR SELECT
TO authenticated
USING (true);

-- Public-facing view excluding owner_id
DROP VIEW IF EXISTS public.restaurants_public;
CREATE VIEW public.restaurants_public
WITH (security_invoker = on) AS
SELECT
  id, name, image, logo, address, latitude, longitude,
  category_id, category_name, rating, delivery_time, delivery_fee,
  min_order, distance, is_open, is_featured, created_at, updated_at
FROM public.restaurants;

-- Allow anon to use the view, but a row-level policy is still required (security_invoker)
-- so add a permissive SELECT policy that only matches anon, never returns owner_id (view excludes it)
CREATE POLICY "Anon can view restaurants via public view"
ON public.restaurants
FOR SELECT
TO anon
USING (true);

-- Lock anon back to ONLY the public columns at the GRANT layer (defense in depth)
REVOKE SELECT ON public.restaurants FROM anon;
GRANT SELECT ON public.restaurants_public TO anon, authenticated;
