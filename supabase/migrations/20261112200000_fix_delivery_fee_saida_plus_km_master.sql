-- MIGRATION: VERIFICAÇÃO MASTER - GARANTIA DA TAXA DE SAÍDA + KM RODADO EM TODAS AS CORRIDAS
-- Garante que em nenhuma hipótese o sistema cobre ou registre apenas a taxa de saída.
-- O cálculo oficial é sempre: Taxa de saída + (KM rodado * Taxa por KM).

-- 1. SANEAMENTO DE DADOS NA TABELA delivery_config
UPDATE public.delivery_config
SET 
  base_fee = CASE WHEN base_fee IS NULL OR base_fee <= 0 THEN 5.30 ELSE base_fee END,
  fee_per_km = CASE WHEN fee_per_km IS NULL OR fee_per_km <= 0 THEN 1.70 ELSE fee_per_km END,
  app_fee_per_delivery = CASE WHEN app_fee_per_delivery IS NULL OR app_fee_per_delivery <= 0 THEN 2.0 ELSE app_fee_per_delivery END,
  updated_at = now();

-- 2. ATUALIZAR deduct_credits_for_delivery COM PISO E BLINDAGEM RIGOROSA DE SAÍDA + KM
CREATE OR REPLACE FUNCTION public.deduct_credits_for_delivery(
  p_pickup_address text,
  p_delivery_address text,
  p_notes text DEFAULT NULL::text,
  p_restaurant_id uuid DEFAULT NULL::uuid,
  p_distance_km numeric DEFAULT 0,
  p_preferred_driver_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  v_caller_id uuid;
  v_store_owner_id uuid;
  v_current_credits numeric;
  v_request_id uuid;
  v_effective_km numeric;
  v_store_lat numeric;
  v_store_lng numeric;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Resolver o ID do dono da loja (permite admin impersonating ou store owner)
  IF p_restaurant_id IS NOT NULL THEN
    SELECT owner_id, latitude, longitude INTO v_store_owner_id, v_store_lat, v_store_lng 
    FROM public.restaurants WHERE id = p_restaurant_id;
  END IF;

  IF v_store_owner_id IS NULL THEN
    SELECT id, owner_id, latitude, longitude INTO p_restaurant_id, v_store_owner_id, v_store_lat, v_store_lng 
    FROM public.restaurants WHERE owner_id = v_caller_id LIMIT 1;
  END IF;

  IF v_store_owner_id IS NULL THEN
    v_store_owner_id := v_caller_id;
  END IF;

  -- Validação de permissão: dono da loja ou administrador
  IF v_caller_id <> v_store_owner_id AND NOT public.has_role(v_caller_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissão para chamar entregador para esta loja';
  END IF;

  -- Fallback de coordenadas da loja se nulas ou fora de Primavera do Leste
  IF v_store_lat IS NULL OR v_store_lng IS NULL OR v_store_lat < -15.80 OR v_store_lat > -15.35 OR v_store_lng < -54.55 OR v_store_lng > -54.05 THEN
    SELECT latitude, longitude INTO v_store_lat, v_store_lng
    FROM public.restaurants
    WHERE owner_id = v_store_owner_id
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

  -- Blindagem: valores padrão caso a tabela esteja com valores zerados ou nulos
  v_base_fee := COALESCE(v_base_fee, 5.30);
  IF v_base_fee <= 0 THEN v_base_fee := 5.30; END IF;

  v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
  IF v_fee_per_km <= 0 THEN v_fee_per_km := 1.70; END IF;

  v_dynamic_pricing_enabled := COALESCE(v_dynamic_pricing_enabled, false);
  v_dynamic_fee_per_km := COALESCE(v_dynamic_fee_per_km, 0);

  -- REGRA SÊNIOR: Se a tarifa dinâmica estiver ATIVA, o valor dinâmico SOMA com a taxa regular por km
  IF v_dynamic_pricing_enabled AND v_dynamic_fee_per_km > 0 THEN
    v_effective_fee_per_km := v_fee_per_km + v_dynamic_fee_per_km;
  ELSE
    v_effective_fee_per_km := v_fee_per_km;
  END IF;

  IF v_effective_fee_per_km <= 0 THEN v_effective_fee_per_km := 1.70; END IF;

  v_min_km := COALESCE(v_min_km, 0);
  v_max_km := COALESCE(v_max_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  -- REGRAS DE QUILOMETRAGEM - GARANTIA SEM EXCEÇÃO
  v_effective_km := COALESCE(p_distance_km, 0);

  -- Nenhuma corrida pode ter 0 km: se vier zerada ou nula, aplica o mínimo do admin ou piso seguro de 1.0 km
  IF v_effective_km <= 0 THEN
    IF v_min_km > 0 THEN
      v_effective_km := v_min_km;
    ELSE
      v_effective_km := 1.0;
    END IF;
  END IF;

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
  v_delivery_cost := round(v_base_fee + (v_effective_fee_per_km * v_effective_km), 2);

  -- Verificar créditos da loja (resolvido por v_store_owner_id)
  SELECT balance INTO v_current_credits
  FROM public.store_credits
  WHERE user_id = v_store_owner_id;

  IF v_current_credits IS NULL OR v_current_credits < v_delivery_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes (Necessário R$ %, Possui R$ %)', round(v_delivery_cost, 2), round(COALESCE(v_current_credits, 0), 2);
  END IF;

  -- Debitar créditos
  UPDATE public.store_credits
  SET balance = balance - v_delivery_cost,
      updated_at = now()
  WHERE user_id = v_store_owner_id;

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
    v_store_owner_id,
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

-- 3. TRIGGER DE INTEGRIDADE: BLINDAGEM DE PRECIFICAÇÃO EM delivery_requests
CREATE OR REPLACE FUNCTION public.fn_ensure_ride_fee_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_fee numeric;
  v_fee_per_km numeric;
  v_dynamic_pricing_enabled boolean;
  v_dynamic_fee_per_km numeric;
  v_effective_fee_per_km numeric;
  v_min_km numeric;
  v_min_floor numeric;
  v_expected_min_cost numeric;
BEGIN
  -- Apenas para corridas pendentes e que não sejam parte de rota rateada de grupo
  IF NEW.status = 'pending' AND NEW.group_id IS NULL THEN
    SELECT 
      base_fee, fee_per_km, dynamic_pricing_enabled, dynamic_fee_per_km, min_km
    INTO 
      v_base_fee, v_fee_per_km, v_dynamic_pricing_enabled, v_dynamic_fee_per_km, v_min_km
    FROM public.delivery_config LIMIT 1;

    v_base_fee := COALESCE(v_base_fee, 5.30);
    IF v_base_fee <= 0 THEN v_base_fee := 5.30; END IF;

    v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
    IF v_fee_per_km <= 0 THEN v_fee_per_km := 1.70; END IF;

    v_min_km := COALESCE(v_min_km, 0);
    v_min_floor := GREATEST(v_min_km, 1.0);

    IF COALESCE(v_dynamic_pricing_enabled, false) AND COALESCE(v_dynamic_fee_per_km, 0) > 0 THEN
      v_effective_fee_per_km := v_fee_per_km + v_dynamic_fee_per_km;
    ELSE
      v_effective_fee_per_km := v_fee_per_km;
    END IF;

    IF v_effective_fee_per_km <= 0 THEN v_effective_fee_per_km := 1.70; END IF;

    -- Assegura distância mínima se nula ou zerada
    IF NEW.distance_km IS NULL OR NEW.distance_km <= 0 THEN
      NEW.distance_km := v_min_floor;
    END IF;

    -- Custo mínimo esperado: taxa de saída + (km * taxa_km)
    v_expected_min_cost := round(v_base_fee + (v_effective_fee_per_km * NEW.distance_km), 2);

    IF NEW.credit_cost IS NULL OR NEW.credit_cost < v_expected_min_cost THEN
      NEW.credit_cost := v_expected_min_cost;
    END IF;
    IF NEW.driver_fee IS NULL OR NEW.driver_fee < v_expected_min_cost THEN
      NEW.driver_fee := v_expected_min_cost;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_ride_fee_integrity ON public.delivery_requests;
CREATE TRIGGER trg_ensure_ride_fee_integrity
BEFORE INSERT OR UPDATE OF status, distance_km, credit_cost, driver_fee
ON public.delivery_requests
FOR EACH ROW
EXECUTE FUNCTION public.fn_ensure_ride_fee_integrity();

-- 4. Saneamento preventivo de corridas pendentes anteriores sem km
UPDATE public.delivery_requests
SET distance_km = 1.0,
    credit_cost = round(5.30 + 1.70, 2),
    driver_fee = round(5.30 + 1.70, 2)
WHERE status = 'pending' AND group_id IS NULL AND (distance_km IS NULL OR distance_km <= 0 OR credit_cost < 7.00);

NOTIFY pgrst, 'reload schema';

