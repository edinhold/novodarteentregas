-- Allow store owners to manage products of their own restaurant
CREATE POLICY "Store owners can insert products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = products.restaurant_id AND r.owner_id = auth.uid()
  )
);

CREATE POLICY "Store owners can update own products"
ON public.products
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = products.restaurant_id AND r.owner_id = auth.uid()
  )
);

CREATE POLICY "Store owners can delete own products"
ON public.products
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = products.restaurant_id AND r.owner_id = auth.uid()
  )
);
