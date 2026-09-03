
-- Create secure function for deducting credits when calling a driver
CREATE OR REPLACE FUNCTION public.deduct_credits_for_delivery(
  p_pickup_address text,
  p_delivery_address text,
  p_notes text DEFAULT NULL,
  p_restaurant_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_cost numeric;
  v_balance numeric;
  v_request_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get cost
  SELECT credit_cost_per_call INTO v_cost FROM public.delivery_config LIMIT 1;
  IF v_cost IS NULL THEN v_cost := 3; END IF;

  -- Get balance
  SELECT balance INTO v_balance FROM public.store_credits WHERE user_id = v_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes. Necessário: %, Disponível: %', v_cost, COALESCE(v_balance, 0);
  END IF;

  -- Deduct
  UPDATE public.store_credits SET balance = balance - v_cost, updated_at = now() WHERE user_id = v_user_id;

  -- Create request
  INSERT INTO public.delivery_requests (store_owner_id, restaurant_id, pickup_address, delivery_address, notes, credit_cost)
  VALUES (v_user_id, p_restaurant_id, p_pickup_address, p_delivery_address, p_notes, v_cost)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;
