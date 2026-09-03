-- 1. Update the deduct_credits_for_delivery function to actually set the driver_id
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
SET search_path TO 'public'
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  
  -- Get config
  SELECT base_fee, fee_per_km, min_km, max_km, round_km_up 
  INTO v_base_fee, v_fee_per_km, v_min_km, v_max_km, v_round_km_up
  FROM public.delivery_config
  LIMIT 1;

  -- Default values if config is missing
  v_base_fee := COALESCE(v_base_fee, 5);
  v_fee_per_km := COALESCE(v_fee_per_km, 1.5);
  v_min_km := COALESCE(v_min_km, 0);
  v_max_km := COALESCE(v_max_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  -- Apply km rules
  v_effective_km := COALESCE(p_distance_km, 0);
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
  SELECT balance INTO v_current_credits
  FROM public.store_credits
  WHERE user_id = v_user_id;

  IF v_current_credits IS NULL OR v_current_credits < v_delivery_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes (Necessário R$ %, Possui R$ %)', round(v_delivery_cost, 2), round(COALESCE(v_current_credits, 0), 2);
  END IF;

  -- Deduct credits
  UPDATE public.store_credits
  SET balance = balance - v_delivery_cost,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Create delivery request
  INSERT INTO public.delivery_requests (
    store_owner_id,
    restaurant_id,
    pickup_address,
    delivery_address,
    notes,
    credit_cost,
    driver_fee,
    status,
    driver_id
  )
  VALUES (
    v_user_id,
    p_restaurant_id,
    p_pickup_address,
    p_delivery_address,
    p_notes,
    v_delivery_cost,
    v_delivery_cost,
    'pending',
    p_preferred_driver_id
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- 2. Update RLS policies for delivery_requests to support directed deliveries
DROP POLICY IF EXISTS "Drivers can view pending requests" ON public.delivery_requests;
CREATE POLICY "Drivers can view pending requests" 
ON public.delivery_requests FOR SELECT 
USING (
  (status = 'pending' AND (driver_id IS NULL OR driver_id = auth.uid())) OR 
  (driver_id = auth.uid()) OR 
  (store_owner_id = auth.uid()) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Ensure store_driver_favorites has proper RLS and grants
ALTER TABLE public.store_driver_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lojistas podem ver seus favoritos" ON public.store_driver_favorites;
CREATE POLICY "Lojistas podem ver seus favoritos" 
ON public.store_driver_favorites FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.restaurants r 
    WHERE r.id = restaurant_id AND r.owner_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Lojistas podem gerenciar seus favoritos" ON public.store_driver_favorites;
CREATE POLICY "Lojistas podem gerenciar seus favoritos" 
ON public.store_driver_favorites FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.restaurants r 
    WHERE r.id = restaurant_id AND r.owner_id = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

GRANT ALL ON public.store_driver_favorites TO authenticated;
GRANT ALL ON public.store_driver_favorites TO service_role;
