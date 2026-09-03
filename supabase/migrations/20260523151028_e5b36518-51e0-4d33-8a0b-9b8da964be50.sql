
-- 1. Fix delivery_requests: require auth for viewing pending
DROP POLICY IF EXISTS "Drivers can view pending requests" ON public.delivery_requests;
CREATE POLICY "Drivers can view pending requests"
ON public.delivery_requests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'driver'::app_role)
  AND (status = 'pending' OR driver_id = auth.uid())
);

-- 2. Fix driver_locations: require auth
DROP POLICY IF EXISTS "Anyone can view driver locations" ON public.driver_locations;
CREATE POLICY "Authenticated users can view driver locations"
ON public.driver_locations
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- 3. Remove driver self-insert for earnings
DROP POLICY IF EXISTS "Drivers can insert own earnings" ON public.driver_earnings;

-- 3b. Create secure RPC to complete a delivery and create earnings atomically
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate request belongs to this driver and is in an acceptable status
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

  -- Get driver internal id
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_user_id LIMIT 1;
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found';
  END IF;

  -- Calculate app fee
  SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent
  FROM public.delivery_config LIMIT 1;

  v_app_fee := (COALESCE(v_request.driver_fee, 0) * v_app_fee_percent) / 100;
  v_driver_amount := GREATEST(COALESCE(v_request.driver_fee, 0) - v_app_fee, 0);

  -- Update status
  UPDATE public.delivery_requests
  SET status = 'delivered', updated_at = now()
  WHERE id = p_request_id;

  -- Insert earning
  INSERT INTO public.driver_earnings (driver_id, delivery_request_id, amount, status)
  VALUES (v_driver_id, p_request_id, v_driver_amount, 'pending')
  RETURNING id INTO v_earning_id;

  RETURN v_earning_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;

-- 4. Fix driver-photos storage upload policy
DROP POLICY IF EXISTS "Authenticated can upload driver photos" ON storage.objects;
CREATE POLICY "Users can upload own driver photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
