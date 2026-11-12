-- Migration: Garantir persistência do distance_km e cálculo estrito taxa de saída + (km * taxa_km)
-- Corrige cálculo de corridas no chamado do lojista

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
  v_dynamic_pricing_enabled boolean;
  v_dynamic_fee_per_km numeric;
  v_effective_fee_per_km numeric;
  v_min_km numeric;
  v_max_km numeric;
  v_round_km_up boolean;
  v_delivery_cost numeric;
  v_user_id uuid;
  v_current_credits numeric;
  v_request_id uuid;
  v_effective_km numeric;
  v_store_lat numeric;
  v_store_lng numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  
  -- Recuperar coordenadas da loja vinculada
  IF p_restaurant_id IS NOT NULL THEN
    SELECT latitude, longitude INTO v_store_lat, v_store_lng
    FROM public.restaurants
    WHERE id = p_restaurant_id;
  END IF;

  -- Se coordenadas forem nulas ou fora de Primavera do Leste, busca do restaurante do usuário
  IF v_store_lat IS NULL OR v_store_lng IS NULL OR v_store_lat < -15.80 OR v_store_lat > -15.35 OR v_store_lng < -54.55 OR v_store_lng > -54.05 THEN
    SELECT latitude, longitude INTO v_store_lat, v_store_lng
    FROM public.restaurants
    WHERE owner_id = v_user_id
    LIMIT 1;
  END IF;

  -- Fallback de segurança para centro de Primavera do Leste se ainda nulo
  IF v_store_lat IS NULL OR v_store_lng IS NULL THEN
    v_store_lat := -15.5595;
    v_store_lng := -54.3079;
  END IF;

  -- Obter configurações de entrega vigentes configuradas pelo admin
  SELECT 
    base_fee, 
    fee_per_km, 
    dynamic_pricing_enabled, 
    dynamic_fee_per_km, 
    min_km, 
    max_km, 
    round_km_up 
  INTO 
    v_base_fee, 
    v_fee_per_km, 
    v_dynamic_pricing_enabled, 
    v_dynamic_fee_per_km, 
    v_min_km, 
    v_max_km, 
    v_round_km_up
  FROM public.delivery_config
  LIMIT 1;

  -- Valores padrão se configuração ausente
  v_base_fee := COALESCE(v_base_fee, 5.3);
  v_fee_per_km := COALESCE(v_fee_per_km, 1.7);
  v_dynamic_pricing_enabled := COALESCE(v_dynamic_pricing_enabled, false);
  v_dynamic_fee_per_km := COALESCE(v_dynamic_fee_per_km, 0);

  -- REGRA SÊNIOR: Se a tarifa dinâmica estiver ATIVA, o valor dinâmico SOMA com a taxa regular por km
  IF v_dynamic_pricing_enabled AND v_dynamic_fee_per_km > 0 THEN
    v_effective_fee_per_km := v_fee_per_km + v_dynamic_fee_per_km;
  ELSE
    v_effective_fee_per_km := v_fee_per_km;
  END IF;

  v_min_km := COALESCE(v_min_km, 0);
  v_max_km := COALESCE(v_max_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  -- Regras de KM
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

  -- CÁLCULO OFICIAL: Taxa de saída + (KM rodado * Taxa por KM)
  v_delivery_cost := v_base_fee + (v_effective_fee_per_km * v_effective_km);

  -- Verificar créditos da loja
  SELECT balance INTO v_current_credits
  FROM public.store_credits
  WHERE user_id = v_user_id;

  IF v_current_credits IS NULL OR v_current_credits < v_delivery_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes (Necessário R$ %, Possui R$ %)', round(v_delivery_cost, 2), round(COALESCE(v_current_credits, 0), 2);
  END IF;

  -- Debitar créditos
  UPDATE public.store_credits
  SET balance = balance - v_delivery_cost,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Criar chamado de entrega com coordenadas reais e distance_km gravados
  INSERT INTO public.delivery_requests (
    store_owner_id,
    restaurant_id,
    pickup_address,
    pickup_lat,
    pickup_lng,
    delivery_address,
    notes,
    credit_cost,
    driver_fee,
    distance_km,
    status
  )
  VALUES (
    v_user_id,
    p_restaurant_id,
    p_pickup_address,
    v_store_lat,
    v_store_lng,
    p_delivery_address,
    p_notes,
    v_delivery_cost,
    v_delivery_cost,
    v_effective_km,
    'pending'
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

