-- 1. Fix 'drivers' table exposure
DROP POLICY IF EXISTS "Allow authenticated to view all drivers" ON public.drivers;
CREATE POLICY "Drivers are visible to authenticated for mapping" 
ON public.drivers FOR SELECT 
TO authenticated 
USING (
  -- Only allow viewing non-sensitive fields if not the owner or admin
  -- (RLS filters rows, not columns, but we can restrict who sees the row)
  -- For full column-level security, we'd need a view, but let's at least ensure 
  -- only the owner or admin can see the full record if needed, 
  -- or here, we allow seeing the row but we should ideally use a view for public maps.
  -- Given current structure, we allow SELECT but encourage frontend to only pick public fields.
  -- However, to satisfy the scanner's high-level concern:
  auth.uid() = user_id OR has_role(auth.uid(), 'admin') OR is_store_owner_of_driver(id)
);

-- 2. Fix 'delivery_requests' anonymous read
DROP POLICY IF EXISTS "Drivers can view pending requests" ON public.delivery_requests;
CREATE POLICY "Drivers can view pending requests" 
ON public.delivery_requests FOR SELECT 
TO authenticated 
USING (
  ((status = 'pending') AND (driver_id IS NULL OR driver_id = auth.uid())) 
  OR driver_id = auth.uid() 
  OR store_owner_id = auth.uid() 
  OR has_role(auth.uid(), 'admin')
);

-- 3. Fix 'delivery_requests' hijack escalation
DROP POLICY IF EXISTS "Drivers can accept or update their requests" ON public.delivery_requests;
CREATE POLICY "Drivers can accept or update their requests" 
ON public.delivery_requests FOR UPDATE 
TO authenticated 
USING (
  (
    (status = 'pending' AND has_role(auth.uid(), 'driver')) -- Only actual drivers can accept
    OR driver_id = auth.uid() 
    OR has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  (
    (status = 'accepted' AND driver_id = auth.uid() AND has_role(auth.uid(), 'driver')) 
    OR driver_id = auth.uid() 
    OR has_role(auth.uid(), 'admin')
  )
);

-- 4. Add missing INSERT policy for 'orders'
DROP POLICY IF EXISTS "Users can insert their own orders" ON public.orders;
CREATE POLICY "Users can insert their own orders" 
ON public.orders FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- 5. Fix security definer warnings by ensuring they are restricted
-- The redeem_credit_code was already REVOKED from public and granted to authenticated, 
-- but we can explicitly set search_path to public for safety (already done in last turn).
-- We'll just re-verify permissions for any other SEC DEF functions if found.
ALTER FUNCTION public.handle_new_user() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.complete_delivery(uuid) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) SECURITY DEFINER SET search_path = public;
