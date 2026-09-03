-- Update SELECT policy for drivers
DROP POLICY IF EXISTS "Drivers can view pending requests" ON public.delivery_requests;
CREATE POLICY "Drivers can view pending requests" 
ON public.delivery_requests 
FOR SELECT 
TO authenticated
USING (
  (status = 'pending') OR 
  (driver_id = auth.uid()) OR 
  (store_owner_id = auth.uid()) OR 
  has_role(auth.uid(), 'admin')
);

-- Update UPDATE policy for drivers
DROP POLICY IF EXISTS "Drivers can accept or update their requests" ON public.delivery_requests;
CREATE POLICY "Drivers can accept or update their requests" 
ON public.delivery_requests 
FOR UPDATE 
TO authenticated
USING (
  (status = 'pending') OR 
  (driver_id = auth.uid()) OR 
  has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (status = 'accepted' AND driver_id = auth.uid()) OR 
  (driver_id = auth.uid()) OR 
  has_role(auth.uid(), 'admin')
);

-- Ensure authenticated role has necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.delivery_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_requests TO service_role;
