-- Migration to allow store owners to view profiles of drivers assigned to their deliveries
DROP POLICY IF EXISTS "Store owners can view profiles of assigned drivers" ON public.profiles;

CREATE POLICY "Store owners can view profiles of assigned drivers"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_requests req
      WHERE (req.store_owner_id = auth.uid() OR req.restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = auth.uid()))
      AND (req.driver_id = profiles.id OR req.driver_id = profiles.user_id)
    )
    OR
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE (d.user_id = profiles.user_id OR d.id = profiles.id)
      AND EXISTS (
        SELECT 1 FROM public.delivery_requests req
        WHERE (req.store_owner_id = auth.uid() OR req.restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = auth.uid()))
        AND (req.driver_id = d.user_id OR req.driver_id = d.id)
      )
    )
  );
