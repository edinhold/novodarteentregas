CREATE OR REPLACE FUNCTION public.deduct_credits_for_delivery(
  p_pickup_address text,
  p_delivery_address text,
  p_notes text DEFAULT NULL,
  p_restaurant_id uuid DEFAULT NULL,
  p_distance_km numeric DEFAULT 0,
  p_preferred_driver_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_fee numeric;
  v_fee_per_km numeric;
  v_min_km numeric;
  v_max_km numeric;
  v_round_km_up boolean;
  v_delivery_cost numeric;
  v_user_id uuid;
  v_current_credits numeric;
  v_request_id uuid;
  v_effective_km numeric;
BEGIN
  v_user_id := auth.uid();
  
  -- Get config
  SELECT base_fee, fee_per_km, min_km, max_km, round_km_up 
  INTO v_base_fee, v_fee_per_km, v_min_km, v_max_km, v_round_km_up
  FROM public.delivery_config
  LIMIT 1;

  -- Apply km rules
  v_effective_km := p_distance_km;
  IF v_round_km_up AND v_effective_km > 0 THEN 
    v_effective_km := ceil(v_effective_km); 
  END IF;
  
  IF v_min_km > 0 AND v_effective_km < v_min_km THEN 
    v_effective_km := v_min_km; 
  END IF;
  
  IF v_max_km > 0 AND v_effective_km > v_max_km THEN 
    v_effective_km := v_max_km; 
  END IF;

  v_delivery_cost := v_base_fee + (v_fee_per_km * v_effective_km);

  -- Check credits
  SELECT amount INTO v_current_credits
  FROM public.store_credits
  WHERE user_id = v_user_id;

  IF v_current_credits IS NULL OR v_current_credits < v_delivery_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes (Necessário R$ %, Possui R$ %)', v_delivery_cost, COALESCE(v_current_credits, 0);
  END IF;

  -- Deduct credits
  UPDATE public.store_credits
  SET amount = amount - v_delivery_cost,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Create delivery request
  INSERT INTO public.delivery_requests (
    store_owner_id,
    restaurant_id,
    pickup_address,
    delivery_address,
    notes,
    distance_km,
    delivery_fee,
    status
  )
  VALUES (
    v_user_id,
    p_restaurant_id,
    p_pickup_address,
    p_delivery_address,
    p_notes,
    p_distance_km,
    v_delivery_cost,
    'pending'
  )
  RETURNING id INTO v_request_id;

  -- If a preferred driver is specified and exists, we could handle it here or via a separate table
  -- For now, let's assume there's a column for this or we just store it in metadata/notes
  IF p_preferred_driver_id IS NOT NULL THEN
    UPDATE public.delivery_requests 
    SET notes = COALESCE(notes, '') || E'\n[DIRECIONADO PARA ENTREGADOR ID: ' || p_preferred_driver_id || ']'
    WHERE id = v_request_id;
  END IF;

  RETURN v_request_id;
END;
$$;
