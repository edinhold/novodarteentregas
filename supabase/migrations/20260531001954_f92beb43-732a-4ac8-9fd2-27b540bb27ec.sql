-- 1. Redefine complete_delivery as SECURITY DEFINER to bypass RLS for its operations
CREATE OR REPLACE FUNCTION public.complete_delivery(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_request RECORD;
  v_driver_id uuid;
  v_app_fee_percent numeric;
  v_app_fee numeric;
  v_driver_amount numeric;
  v_earning_id uuid;
BEGIN
  -- Get the ID of the user calling the function
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate request exists and belongs to this driver
  -- Note: driver_id in delivery_requests stores the user_id (auth.uid())
  SELECT id, driver_id, status, driver_fee
  INTO v_request
  FROM public.delivery_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery request not found';
  END IF;

  IF v_request.driver_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Not authorized for this delivery';
  END IF;

  IF v_request.status = 'delivered' THEN
    RAISE EXCEPTION 'Delivery already completed';
  END IF;

  -- Get driver's internal UUID from the drivers table
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_user_id LIMIT 1;
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found';
  END IF;

  -- Calculate fees based on configuration
  SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent
  FROM public.delivery_config LIMIT 1;

  v_app_fee := (COALESCE(v_request.driver_fee, 0) * v_app_fee_percent) / 100;
  v_driver_amount := GREATEST(COALESCE(v_request.driver_fee, 0) - v_app_fee, 0);

  -- Update delivery status
  UPDATE public.delivery_requests
  SET status = 'delivered', updated_at = now()
  WHERE id = p_request_id;

  -- Create the earning record
  INSERT INTO public.driver_earnings (driver_id, delivery_request_id, amount, status)
  VALUES (v_driver_id, p_request_id, v_driver_amount, 'pending')
  RETURNING id INTO v_earning_id;

  RETURN v_earning_id;
END;
$$;

-- 2. Grant permissions to the authenticated role and service_role
-- Grants for the function
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO service_role;

-- Grants for the tables (PostgREST requires explicit grants)
GRANT SELECT ON public.driver_earnings TO authenticated;
GRANT ALL ON public.driver_earnings TO service_role;

GRANT SELECT, UPDATE ON public.delivery_requests TO authenticated;
GRANT ALL ON public.delivery_requests TO service_role;

GRANT SELECT ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;

GRANT SELECT ON public.delivery_config TO authenticated;
GRANT ALL ON public.delivery_config TO service_role;

-- 3. Ensure RLS is enabled and policies are in place
ALTER TABLE public.driver_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view own earnings" ON public.driver_earnings;
CREATE POLICY "Drivers can view own earnings" ON public.driver_earnings 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.drivers d 
    WHERE d.id = driver_earnings.driver_id AND d.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage earnings" ON public.driver_earnings;
CREATE POLICY "Admins can manage earnings" ON public.driver_earnings 
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role)
);
