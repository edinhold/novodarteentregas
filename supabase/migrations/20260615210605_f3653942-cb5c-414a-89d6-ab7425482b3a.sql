
-- Allow store owners to see active drivers (limited to mapping-relevant info via the existing column-level access)
CREATE POLICY "Store owners can view active drivers"
ON public.drivers
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND public.has_role(auth.uid(), 'store_owner'::app_role)
);

-- Allow store owners to see live driver locations for the radar
CREATE POLICY "Store owners can view driver locations"
ON public.driver_locations
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'store_owner'::app_role)
);
