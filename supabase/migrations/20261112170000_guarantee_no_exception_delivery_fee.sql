-- Migration: Garantia Absoluta Sem Exceção do Cálculo de Corridas: Saída + KM Rodados
-- Blindagem em nível de banco de dados, RPCs e triggers para assegurar que 100% das corridas
-- cobrem a taxa fixa de saída somada à taxa por km rodado.

-- 1. ATUALIZAR deduct_credits_for_delivery COM PISO E GARANTIA DE SAÍDA + KM
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

-- 2. ATUALIZAR create_delivery_group COM SUPORTE A TARIFA DINÂMICA E PISO DE KM
CREATE OR REPLACE FUNCTION public.create_delivery_group(
  p_restaurant_id uuid,
  p_pickup_address text,
  p_stops jsonb,                -- [{delivery_address, customer_name, customer_phone, notes, distance_km}]
  p_preferred_driver_id uuid DEFAULT NULL,
  p_group_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_store_owner_id uuid;
  v_base_fee numeric; 
  v_fee_per_km numeric; 
  v_dynamic_pricing_enabled boolean;
  v_dynamic_fee_per_km numeric;
  v_effective_fee_per_km numeric;
  v_min_km numeric; 
  v_max_km numeric; 
  v_round_km_up boolean;
  v_balance numeric; 
  v_total_cost numeric := 0; 
  v_group_id uuid;
  v_stop jsonb; 
  v_leg_km numeric; 
  v_total_distance_km numeric := 0; 
  v_billable_km numeric := 0;
  v_stop_cost numeric; 
  v_stops_count int;
  v_store_lat numeric;
  v_store_lng numeric;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_stops IS NULL OR jsonb_array_length(p_stops) = 0 THEN RAISE EXCEPTION 'Adicione pelo menos uma parada'; END IF;
  v_stops_count := jsonb_array_length(p_stops);
  IF v_stops_count > 10 THEN RAISE EXCEPTION 'Máximo de 10 paradas por rota'; END IF;

  -- Resolve real store owner ID e coordenadas do restaurante
  SELECT owner_id, latitude, longitude INTO v_store_owner_id, v_store_lat, v_store_lng 
  FROM public.restaurants 
  WHERE id = p_restaurant_id;

  IF v_store_owner_id IS NULL THEN
    v_store_owner_id := v_caller_id;
  END IF;

  -- Validate caller is either the store owner or an admin
  IF v_caller_id <> v_store_owner_id AND NOT public.has_role(v_caller_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissão para criar entregas para esta loja';
  END IF;

  -- 1. Obtém a regra oficial de precificação do Admin (incluindo tarifa dinâmica)
  SELECT 
    base_fee, 
    fee_per_km, 
    min_km, 
    max_km, 
    round_km_up,
    dynamic_pricing_enabled,
    dynamic_fee_per_km
  INTO 
    v_base_fee, 
    v_fee_per_km, 
    v_min_km, 
    v_max_km, 
    v_round_km_up,
    v_dynamic_pricing_enabled,
    v_dynamic_fee_per_km
  FROM public.delivery_config LIMIT 1;

  v_base_fee := COALESCE(v_base_fee, 5.30);
  v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
  v_dynamic_pricing_enabled := COALESCE(v_dynamic_pricing_enabled, false);
  v_dynamic_fee_per_km := COALESCE(v_dynamic_fee_per_km, 0);

  IF v_dynamic_pricing_enabled AND v_dynamic_fee_per_km > 0 THEN
    v_effective_fee_per_km := v_fee_per_km + v_dynamic_fee_per_km;
  ELSE
    v_effective_fee_per_km := v_fee_per_km;
  END IF;

  v_min_km := COALESCE(v_min_km, 0);
  v_max_km := COALESCE(v_max_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  -- 2. Soma a distância total real da rota (soma dos trechos sequenciais)
  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
    v_leg_km := COALESCE((v_stop->>'distance_km')::numeric, 0);
    IF v_leg_km < 0 THEN v_leg_km := 0; END IF;
    v_total_distance_km := v_total_distance_km + v_leg_km;
  END LOOP;

  -- 3. Aplica regras de km faturável (com piso mínimo absoluto para garantir cobrança de saída + km)
  v_billable_km := v_total_distance_km;
  IF v_billable_km <= 0 THEN
    IF v_min_km > 0 THEN
      v_billable_km := v_min_km;
    ELSE
      v_billable_km := 1.0;
    END IF;
  END IF;

  IF v_round_km_up AND v_billable_km > 0 THEN
    v_billable_km := ceil(v_billable_km);
  END IF;
  IF v_min_km > 0 AND v_billable_km < v_min_km THEN
    v_billable_km := v_min_km;
  END IF;
  IF v_max_km > 0 AND v_billable_km > v_max_km THEN
    v_billable_km := v_max_km;
  END IF;

  -- 4. CÁLCULO UNIFICADO DA OPERAÇÃO: Base Fee (1x) + (Fee/km * Billable KM)
  v_total_cost := round(v_base_fee + (v_effective_fee_per_km * v_billable_km), 2);

  -- 5. Verifica saldo e deduz UMA ÚNICA VEZ do saldo da loja
  SELECT balance INTO v_balance FROM public.store_credits WHERE user_id = v_store_owner_id;
  IF v_balance IS NULL OR v_balance < v_total_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes (Necessário R$ %, Possui R$ %)', round(v_total_cost, 2), round(COALESCE(v_balance, 0), 2);
  END IF;

  UPDATE public.store_credits SET balance = balance - v_total_cost, updated_at = now() WHERE user_id = v_store_owner_id;

  -- 6. Registra o grupo com o custo unificado correto
  INSERT INTO public.delivery_groups (
    store_owner_id, restaurant_id, pickup_address, driver_id, total_cost, stops_count, notes
  ) VALUES (
    v_store_owner_id, p_restaurant_id, p_pickup_address, p_preferred_driver_id, v_total_cost, v_stops_count, p_group_notes
  ) RETURNING id INTO v_group_id;

  -- 7. Cria cada requisição individual com custo proporcional à sua distância no grupo
  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
    v_leg_km := COALESCE((v_stop->>'distance_km')::numeric, 0);
    IF v_leg_km < 0 THEN v_leg_km := 0; END IF;

    IF v_total_distance_km > 0 THEN
      v_stop_cost := round(v_total_cost * (v_leg_km / v_total_distance_km), 2);
    ELSE
      v_stop_cost := round(v_total_cost / v_stops_count, 2);
    END IF;

    INSERT INTO public.delivery_requests (
      store_owner_id, restaurant_id, pickup_address, pickup_lat, pickup_lng, delivery_address, notes,
      credit_cost, driver_fee, status, driver_id, group_id, customer_name, customer_phone, distance_km
    ) VALUES (
      v_store_owner_id, p_restaurant_id, p_pickup_address, v_store_lat, v_store_lng, v_stop->>'delivery_address', v_stop->>'notes',
      v_stop_cost, v_stop_cost, 'pending', p_preferred_driver_id, v_group_id,
      v_stop->>'customer_name', v_stop->>'customer_phone', GREATEST(v_leg_km, 0.5)
    );
  END LOOP;

  RETURN v_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_delivery_group TO authenticated, service_role;

-- 3. TRIGGER DE INTEGRIDADE: BLINDAGEM DE PRECIFICAÇÃO EM delivery_requests
-- Garante que nenhuma corrida individual ativa seja salva com valores inferiores a (saída + km)
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
    v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
    v_min_km := COALESCE(v_min_km, 0);
    v_min_floor := GREATEST(v_min_km, 1.0);

    IF COALESCE(v_dynamic_pricing_enabled, false) AND COALESCE(v_dynamic_fee_per_km, 0) > 0 THEN
      v_effective_fee_per_km := v_fee_per_km + v_dynamic_fee_per_km;
    ELSE
      v_effective_fee_per_km := v_fee_per_km;
    END IF;

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

