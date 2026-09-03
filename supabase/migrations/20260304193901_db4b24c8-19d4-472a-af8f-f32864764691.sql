
-- 1. Fix credit_codes: restrict SELECT to admins only (was open to everyone)
DROP POLICY IF EXISTS "Store owners can view unused codes" ON public.credit_codes;
CREATE POLICY "Only admins can view codes" ON public.credit_codes
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Fix store_credits: remove user self-UPDATE (should only be via RPC/admin)
DROP POLICY IF EXISTS "Store owners can update own credits" ON public.store_credits;

-- 3. Fix store_credits: remove user self-INSERT (should only be via RPC/admin)
DROP POLICY IF EXISTS "Users can insert own credits" ON public.store_credits;
