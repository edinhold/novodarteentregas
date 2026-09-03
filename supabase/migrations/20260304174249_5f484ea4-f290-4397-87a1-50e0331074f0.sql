
-- Allow authenticated users to insert their own role during registration
CREATE POLICY "Authenticated can insert own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow store owners to update their own credits (for deducting on driver call)
CREATE POLICY "Store owners can update own credits" ON public.store_credits
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow store owners to insert their own credits row (initial creation)
CREATE POLICY "Users can insert own credits" ON public.store_credits
  FOR INSERT WITH CHECK (auth.uid() = user_id);
