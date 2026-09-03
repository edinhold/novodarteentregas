-- Allow authenticated users to insert their own restaurant (for store owner registration)
CREATE POLICY "Authenticated can insert own restaurant"
ON public.restaurants
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);
