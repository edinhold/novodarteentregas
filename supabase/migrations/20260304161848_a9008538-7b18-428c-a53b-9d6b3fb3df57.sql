
-- Allow admins to delete restaurants
CREATE POLICY "Admins can delete restaurants"
ON public.restaurants FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete products  
CREATE POLICY "Admins can delete products"
ON public.products FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
