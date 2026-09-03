CREATE POLICY "Drivers can insert own earnings"
ON public.driver_earnings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = driver_earnings.driver_id
    AND d.user_id = auth.uid()
  )
);