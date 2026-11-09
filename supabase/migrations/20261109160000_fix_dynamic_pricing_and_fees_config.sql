-- Migration: Fix Dynamic Pricing calculation (SUM with km fee) and robust update RPC
-- Ensures that when dynamic pricing is enabled, dynamic_fee_per_km adds to (soma com) fee_per_km

-- 1. Ensure columns exist with proper defaults
ALTER TABLE public.delivery_config
  ADD COLUMN IF NOT EXISTS dynamic_pricing_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dynamic_fee_per_km numeric DEFAULT 0;

-- 2. Grant permissions on delivery_config
GRANT SELECT, UPDATE, INSERT ON public.delivery_config TO authenticated;
GRANT ALL ON public.delivery_config TO service_role;

DROP POLICY IF EXISTS "Admins can update config" ON public.delivery_config;
CREATE POLICY "Admins can update config"
  ON public.delivery_config
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert config" ON public.delivery_config;
CREATE POLICY "Admins can insert config"
  ON public.delivery_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Dedicated SECURITY DEFINER RPC to update delivery config reliably without RLS hiccups
CREATE OR REPLACE FUNCTION public.update_delivery_config(
  p_base_fee numeric,
  p_fee_per_km numeric,
  p_min_km numeric,
  p_max_km numeric,
  p_round_km_up boolean,
  p_dynamic_pricing_enabled boolean,
  p_dynamic_fee_per_km numeric,
  p_early_withdrawal_fee_percent numeric DEFAULT 10,
  p_withdrawal_fixed_fee numeric DEFAULT 1.00,
  p_payment_day integer DEFAULT 3,
  p_app_fee_per_delivery numeric DEFAULT 2,
  p_whatsapp_number text DEFAULT '',
  p_recharge_url text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean;
  v_updated record;
  v_existing_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT public.has_role(v_caller_id, 'admin'::app_role) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar as taxas';
  END IF;

  SELECT id INTO v_existing_id FROM public.delivery_config LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.delivery_config
    SET
      base_fee = COALESCE(p_base_fee, 5.3),
      fee_per_km = COALESCE(p_fee_per_km, 1.7),
      min_km = COALESCE(p_min_km, 0),
      max_km = COALESCE(p_max_km, 0),
      round_km_up = COALESCE(p_round_km_up, false),
      dynamic_pricing_enabled = COALESCE(p_dynamic_pricing_enabled, false),
      dynamic_fee_per_km = COALESCE(p_dynamic_fee_per_km, 0),
      early_withdrawal_fee_percent = COALESCE(p_early_withdrawal_fee_percent, 10),
      withdrawal_fixed_fee = COALESCE(p_withdrawal_fixed_fee, 1.00),
      payment_day = COALESCE(p_payment_day, 3),
      app_fee_per_delivery = COALESCE(p_app_fee_per_delivery, 2),
      whatsapp_number = COALESCE(p_whatsapp_number, ''),
      recharge_url = COALESCE(p_recharge_url, ''),
      updated_at = now()
    WHERE id = v_existing_id
    RETURNING * INTO v_updated;
  ELSE
    INSERT INTO public.delivery_config (
      base_fee, fee_per_km, min_km, max_km, round_km_up,
      dynamic_pricing_enabled, dynamic_fee_per_km,
      early_withdrawal_fee_percent, withdrawal_fixed_fee, payment_day, app_fee_per_delivery,
      whatsapp_number, recharge_url, updated_at
    )
    VALUES (
      COALESCE(p_base_fee, 5.3), COALESCE(p_fee_per_km, 1.7), COALESCE(p_min_km, 0), COALESCE(p_max_km, 0), COALESCE(p_round_km_up, false),
      COALESCE(p_dynamic_pricing_enabled, false), COALESCE(p_dynamic_fee_per_km, 0),
      COALESCE(p_early_withdrawal_fee_percent, 10), COALESCE(p_withdrawal_fixed_fee, 1.00), COALESCE(p_payment_day, 3), COALESCE(p_app_fee_per_delivery, 2),
      COALESCE(p_whatsapp_number, ''), COALESCE(p_recharge_url, ''), now()
    )
    RETURNING * INTO v_updated;
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_delivery_config TO authenticated;

-- 4. Recreate deduct_credits_for_delivery RPC with DYNAMIC PRICING SUM LOGIC
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
  IF v_store_lat IS NULL OR v_store_lng IS NULL OR v_store_lat < -15.70 OR v_store_lat > -15.40 THEN
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

  -- Obter configurações de entrega
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

  -- REGRA SÊNIOR: Se a tarifa dinâmica estiver ATIVA, o valor dinâmico SOMA com a taxa regular por km!
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

  v_delivery_cost := v_base_fee + (v_effective_fee_per_km * v_effective_km);

  -- Verificar créditos
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

  -- Criar chamado de entrega com coordenadas reais gravadas
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
    'pending'
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery TO authenticated;

-- 5. Update get_public_delivery_config to guarantee dynamic pricing columns are returned
CREATE OR REPLACE FUNCTION public.get_public_delivery_config()
RETURNS TABLE(
  id uuid, 
  base_fee numeric, 
  fee_per_km numeric, 
  min_km numeric, 
  max_km numeric, 
  round_km_up boolean, 
  promo_credit_percent numeric, 
  payment_day integer, 
  early_withdrawal_fee_percent numeric, 
  withdrawal_fixed_fee numeric, 
  app_fee_per_delivery numeric,
  dynamic_pricing_enabled boolean,
  dynamic_fee_per_km numeric,
  whatsapp_number text, 
  recharge_url text, 
  updated_at timestamp with time zone
)
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path TO 'public'
AS $function$
  SELECT 
    id, 
    base_fee, 
    fee_per_km, 
    min_km, 
    max_km, 
    round_km_up, 
    promo_credit_percent,
    payment_day, 
    early_withdrawal_fee_percent, 
    withdrawal_fixed_fee,
    app_fee_per_delivery,
    dynamic_pricing_enabled,
    dynamic_fee_per_km,
    whatsapp_number, 
    recharge_url, 
    updated_at
  FROM public.delivery_config 
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_delivery_config() TO anon, authenticated, service_role;

