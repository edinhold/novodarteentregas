CREATE OR REPLACE FUNCTION public.deduct_credits_for_delivery(p_pickup_address text, p_delivery_address text, p_notes text DEFAULT NULL::text, p_restaurant_id uuid DEFAULT NULL::uuid, p_distance_km numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_base_fee numeric;
  v_fee_per_km numeric;
  v_min_km numeric;
  v_max_km numeric;
  v_round_up boolean;
  v_effective_km numeric;
  v_cost numeric;
  v_balance numeric;
  v_request_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get fees
  SELECT base_fee, fee_per_km, min_km, max_km, round_km_up 
  INTO v_base_fee, v_fee_per_km, v_min_km, v_max_km, v_round_up 
  FROM public.delivery_config LIMIT 1;
  
  IF v_base_fee IS NULL THEN v_base_fee := 5; END IF;
  IF v_fee_per_km IS NULL THEN v_fee_per_km := 1.5; END IF;
  IF v_min_km IS NULL THEN v_min_km := 0; END IF;
  IF v_max_km IS NULL THEN v_max_km := 0; END IF;
  IF v_round_up IS NULL THEN v_round_up := false; END IF;

  -- Apply km rules
  v_effective_km := COALESCE(p_distance_km, 0);
  
  -- Round up to whole km if configured
  IF v_round_up AND v_effective_km > 0 THEN
    v_effective_km := ceil(v_effective_km);
  END IF;
  
  -- Apply minimum km
  IF v_min_km > 0 AND v_effective_km < v_min_km THEN
    v_effective_km := v_min_km;
  END IF;
  
  -- Apply maximum km
  IF v_max_km > 0 AND v_effective_km > v_max_km THEN
    v_effective_km := v_max_km;
  END IF;

  -- Calculate cost: base + per_km * distance
  v_cost := v_base_fee + (v_fee_per_km * v_effective_km);

  -- Get balance
  SELECT balance INTO v_balance FROM public.store_credits WHERE user_id = v_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes. Necessário: R$ %, Disponível: R$ %', round(v_cost, 2), round(COALESCE(v_balance, 0), 2);
  END IF;

  -- Deduct
  UPDATE public.store_credits SET balance = balance - v_cost, updated_at = now() WHERE user_id = v_user_id;

  -- Create request with driver_fee = cost
  INSERT INTO public.delivery_requests (store_owner_id, restaurant_id, pickup_address, delivery_address, notes, credit_cost, driver_fee)
  VALUES (v_user_id, p_restaurant_id, p_pickup_address, p_delivery_address, p_notes, v_cost, v_cost)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$function$;