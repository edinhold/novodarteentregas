-- MIGRATION: CORREÇÃO DEFINITIVA DA TARIFA DINÂMICA (TOGGLE LIGA/DESLIGA & PREVENÇÃO DE RESÍDUOS)
-- Garante que quando o admin desliga a tarifa dinâmica:
-- 1. dynamic_fee_per_km é imediatamente zerado (0.00) e dynamic_pricing_enabled é false
-- 2. get_public_delivery_config, get_admin_delivery_config e deduct_credits_for_delivery retornam estritamente 0 de adicional dinâmico
-- 3. Inexistência de linhas duplicadas ou antigas em delivery_config (enforce singleton e ORDER BY updated_at DESC)
-- 4. Invalidação e propagação em tempo real para os painéis de lojistas e motoristas

-- 1. SANEAMENTO E GARANTIA DE REGISTRO ÚNICO (SINGLETON) NA TABELA delivery_config
DELETE FROM public.delivery_config
WHERE id NOT IN (
  SELECT id FROM public.delivery_config
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
);

UPDATE public.delivery_config
SET 
  base_fee = CASE WHEN base_fee IS NULL OR base_fee <= 0 THEN 5.30 ELSE base_fee END,
  fee_per_km = CASE WHEN fee_per_km IS NULL OR fee_per_km <= 0 THEN 1.70 ELSE fee_per_km END,
  dynamic_pricing_enabled = COALESCE(dynamic_pricing_enabled, false),
  dynamic_fee_per_km = CASE 
    WHEN dynamic_pricing_enabled IS TRUE AND dynamic_fee_per_km IS NOT NULL AND dynamic_fee_per_km > 0 
    THEN dynamic_fee_per_km 
    ELSE 0 
  END,
  app_fee_per_delivery = CASE WHEN app_fee_per_delivery IS NULL OR app_fee_per_delivery <= 0 THEN 2.0 ELSE app_fee_per_delivery END,
  updated_at = now();

-- 2. ATUALIZAR RPC update_delivery_config COM ZERAMENTO RIGOROSO DE dynamic_fee_per_km QUANDO DESATIVADA
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
  v_dynamic_enabled boolean;
  v_dynamic_fee numeric;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT public.has_role(v_caller_id, 'admin'::app_role) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar as taxas';
  END IF;

  -- Busca o registro mais recente
  SELECT id INTO v_existing_id 
  FROM public.delivery_config 
  ORDER BY updated_at DESC NULLS LAST 
  LIMIT 1;

  -- Se dinâmica estiver desligada, a taxa adicional é estritamente 0
  v_dynamic_enabled := COALESCE(p_dynamic_pricing_enabled, false);
  IF NOT v_dynamic_enabled THEN
    v_dynamic_fee := 0;
  ELSE
    v_dynamic_fee := GREATEST(0, COALESCE(p_dynamic_fee_per_km, 0));
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.delivery_config
    SET
      base_fee = COALESCE(p_base_fee, 5.3),
      fee_per_km = COALESCE(p_fee_per_km, 1.7),
      min_km = COALESCE(p_min_km, 0),
      max_km = COALESCE(p_max_km, 0),
      round_km_up = COALESCE(p_round_km_up, false),
      dynamic_pricing_enabled = v_dynamic_enabled,
      dynamic_fee_per_km = v_dynamic_fee,
      early_withdrawal_fee_percent = COALESCE(p_early_withdrawal_fee_percent, 10),
      withdrawal_fixed_fee = COALESCE(p_withdrawal_fixed_fee, 1.00),
      payment_day = COALESCE(p_payment_day, 3),
      app_fee_per_delivery = COALESCE(p_app_fee_per_delivery, 2),
      whatsapp_number = COALESCE(p_whatsapp_number, ''),
      recharge_url = COALESCE(p_recharge_url, ''),
      updated_at = now()
    WHERE id = v_existing_id
    RETURNING * INTO v_updated;

    -- Deleta quaisquer outras linhas órfãs mantendo apenas a atual
    DELETE FROM public.delivery_config WHERE id <> v_existing_id;
  ELSE
    INSERT INTO public.delivery_config (
      base_fee, fee_per_km, min_km, max_km, round_km_up,
      dynamic_pricing_enabled, dynamic_fee_per_km,
      early_withdrawal_fee_percent, withdrawal_fixed_fee, payment_day, app_fee_per_delivery,
      whatsapp_number, recharge_url, updated_at
    )
    VALUES (
      COALESCE(p_base_fee, 5.3), COALESCE(p_fee_per_km, 1.7), COALESCE(p_min_km, 0), COALESCE(p_max_km, 0), COALESCE(p_round_km_up, false),
      v_dynamic_enabled, v_dynamic_fee,
      COALESCE(p_early_withdrawal_fee_percent, 10), COALESCE(p_withdrawal_fixed_fee, 1.00), COALESCE(p_payment_day, 3), COALESCE(p_app_fee_per_delivery, 2),
      COALESCE(p_whatsapp_number, ''), COALESCE(p_recharge_url, ''), now()
    )
    RETURNING * INTO v_updated;
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_delivery_config TO authenticated, service_role;

-- 3. ATUALIZAR get_public_delivery_config PARA GARANTIR ZERO DINÂMICO SE DESLIGADO
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
    COALESCE(base_fee, 5.30) AS base_fee, 
    COALESCE(fee_per_km, 1.70) AS fee_per_km, 
    COALESCE(min_km, 0) AS min_km, 
    COALESCE(max_km, 0) AS max_km, 
    COALESCE(round_km_up, false) AS round_km_up, 
    COALESCE(promo_credit_percent, 0) AS promo_credit_percent,
    COALESCE(payment_day, 3) AS payment_day, 
    COALESCE(early_withdrawal_fee_percent, 10) AS early_withdrawal_fee_percent, 
    COALESCE(withdrawal_fixed_fee, 1.00) AS withdrawal_fixed_fee,
    COALESCE(app_fee_per_delivery, 2) AS app_fee_per_delivery,
    COALESCE(dynamic_pricing_enabled, false) AS dynamic_pricing_enabled,
    CASE 
      WHEN COALESCE(dynamic_pricing_enabled, false) IS TRUE THEN GREATEST(0, COALESCE(dynamic_fee_per_km, 0))
      ELSE 0 
    END AS dynamic_fee_per_km,
    COALESCE(whatsapp_number, '') AS whatsapp_number, 
    COALESCE(recharge_url, '') AS recharge_url, 
    updated_at
  FROM public.delivery_config 
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_delivery_config() TO anon, authenticated, service_role;

-- 4. ATUALIZAR get_admin_delivery_config
CREATE OR REPLACE FUNCTION public.get_admin_delivery_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg record;
BEGIN
  SELECT * INTO v_cfg 
  FROM public.delivery_config 
  ORDER BY updated_at DESC NULLS LAST 
  LIMIT 1;

  IF v_cfg IS NULL THEN
    RETURN NULL;
  END IF;

  -- Se dinâmica estiver desligada, garante que dynamic_fee_per_km retorne 0
  IF v_cfg.dynamic_pricing_enabled IS NOT TRUE THEN
    v_cfg.dynamic_fee_per_km := 0;
    v_cfg.dynamic_pricing_enabled := false;
  END IF;

  RETURN to_jsonb(v_cfg);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_delivery_config() TO authenticated, service_role;

-- 5. ATUALIZAR deduct_credits_for_delivery COM ORDER BY DESC E VERIFICAÇÃO ESTRITA DE DINÂMICA
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

  -- Obter configurações de entrega vigentes configuradas pelo admin (mais recente)
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
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  -- Blindagem: valores padrão caso a tabela esteja com valores zerados ou nulos
  v_base_fee := COALESCE(v_base_fee, 5.30);
  IF v_base_fee <= 0 THEN v_base_fee := 5.30; END IF;

  v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
  IF v_fee_per_km <= 0 THEN v_fee_per_km := 1.70; END IF;

  v_dynamic_pricing_enabled := COALESCE(v_dynamic_pricing_enabled, false);
  v_dynamic_fee_per_km := COALESCE(v_dynamic_fee_per_km, 0);

  -- REGRA SÊNIOR: Apenas se a tarifa dinâmica estiver ATIVA e o valor for > 0, soma com o valor do km
  IF v_dynamic_pricing_enabled IS TRUE AND v_dynamic_fee_per_km > 0 THEN
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

-- 6. ATUALIZAR TRIGGER fn_ensure_ride_fee_integrity COM ORDER BY DESC E VERIFICAÇÃO DE DINÂMICA
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
    FROM public.delivery_config 
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    v_base_fee := COALESCE(v_base_fee, 5.30);
    IF v_base_fee <= 0 THEN v_base_fee := 5.30; END IF;

    v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
    IF v_fee_per_km <= 0 THEN v_fee_per_km := 1.70; END IF;

    v_min_km := COALESCE(v_min_km, 0);
    v_min_floor := GREATEST(v_min_km, 1.0);

    IF COALESCE(v_dynamic_pricing_enabled, false) IS TRUE AND COALESCE(v_dynamic_fee_per_km, 0) > 0 THEN
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

-- 7. ATUALIZAR create_delivery_group COM ORDER BY DESC E VERIFICAÇÃO DE DINÂMICA
CREATE OR REPLACE FUNCTION public.create_delivery_group(
  p_group_id uuid,
  p_group_name text,
  p_items jsonb,
  p_restaurant_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id uuid;
  v_store_owner_id uuid;
  v_current_credits numeric;
  v_total_cost numeric := 0;
  v_total_distance numeric := 0;
  v_base_fee numeric;
  v_fee_per_km numeric;
  v_min_km numeric;
  v_max_km numeric;
  v_round_km_up boolean;
  v_dynamic_pricing_enabled boolean;
  v_dynamic_fee_per_km numeric;
  v_effective_fee_per_km numeric;
  v_item jsonb;
  v_pickup_address text;
  v_delivery_address text;
  v_notes text;
  v_distance_km numeric;
  v_cost_per_item numeric;
  v_created_ids uuid[] := '{}';
  v_new_req_id uuid;
  v_items_count integer;
  v_item_index integer := 0;
  v_allocated_cost numeric := 0;
  v_item_credit_cost numeric;
  v_store_lat numeric;
  v_store_lng numeric;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

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

  IF v_caller_id <> v_store_owner_id AND NOT public.has_role(v_caller_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissão para criar entregas para esta loja';
  END IF;

  -- 1. Obtém a regra oficial de precificação do Admin (mais recente)
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
  FROM public.delivery_config 
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  v_base_fee := COALESCE(v_base_fee, 5.30);
  v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
  v_dynamic_pricing_enabled := COALESCE(v_dynamic_pricing_enabled, false);
  v_dynamic_fee_per_km := COALESCE(v_dynamic_fee_per_km, 0);

  IF v_dynamic_pricing_enabled IS TRUE AND v_dynamic_fee_per_km > 0 THEN
    v_effective_fee_per_km := v_fee_per_km + v_dynamic_fee_per_km;
  ELSE
    v_effective_fee_per_km := v_fee_per_km;
  END IF;

  v_min_km := COALESCE(v_min_km, 0);
  v_max_km := COALESCE(v_max_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  -- 2. Soma a distância total real da rota
  v_items_count := jsonb_array_length(p_items);
  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'A lista de entregas do grupo não pode estar vazia';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_distance_km := COALESCE((v_item->>'distance_km')::numeric, 0);
    IF v_distance_km <= 0 THEN
      v_distance_km := GREATEST(v_min_km, 1.0);
    END IF;
    v_total_distance := v_total_distance + v_distance_km;
  END LOOP;

  IF v_round_km_up AND v_total_distance > 0 THEN
    v_total_distance := ceil(v_total_distance);
  END IF;
  IF v_min_km > 0 AND v_total_distance < v_min_km THEN
    v_total_distance := v_min_km;
  END IF;
  IF v_max_km > 0 AND v_total_distance > v_max_km THEN
    v_total_distance := v_max_km;
  END IF;

  v_total_cost := round(v_base_fee + (v_effective_fee_per_km * v_total_distance), 2);

  -- 3. Verifica saldo de créditos
  SELECT balance INTO v_current_credits
  FROM public.store_credits
  WHERE user_id = v_store_owner_id;

  IF v_current_credits IS NULL OR v_current_credits < v_total_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes para o grupo (Necessário R$ %, Possui R$ %)', v_total_cost, COALESCE(v_current_credits, 0);
  END IF;

  -- 4. Debita créditos
  UPDATE public.store_credits
  SET balance = balance - v_total_cost,
      updated_at = now()
  WHERE user_id = v_store_owner_id;

  -- 5. Cria as entregas associadas ao grupo
  v_cost_per_item := round(v_total_cost / v_items_count, 2);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_index := v_item_index + 1;
    v_pickup_address := v_item->>'pickup_address';
    v_delivery_address := v_item->>'delivery_address';
    v_notes := COALESCE(v_item->>'notes', p_notes);
    v_distance_km := COALESCE((v_item->>'distance_km')::numeric, round(v_total_distance / v_items_count, 2));

    IF v_item_index = v_items_count THEN
      v_item_credit_cost := v_total_cost - v_allocated_cost;
    ELSE
      v_item_credit_cost := v_cost_per_item;
      v_allocated_cost := v_allocated_cost + v_cost_per_item;
    END IF;

    INSERT INTO public.delivery_requests (
      group_id,
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
      p_group_id,
      v_store_owner_id,
      p_restaurant_id,
      v_pickup_address,
      v_store_lat,
      v_store_lng,
      v_delivery_address,
      v_notes,
      v_item_credit_cost,
      v_item_credit_cost,
      v_distance_km,
      'pending'
    )
    RETURNING id INTO v_new_req_id;

    v_created_ids := array_append(v_created_ids, v_new_req_id);
  END LOOP;

  RETURN jsonb_build_object(
    'group_id', p_group_id,
    'total_cost', v_total_cost,
    'total_distance', v_total_distance,
    'effective_fee_per_km', v_effective_fee_per_km,
    'created_requests', v_created_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_delivery_group TO authenticated, service_role;

-- 8. ASSEGURAR REALTIME FULL REPLICA IDENTITY EM delivery_config
ALTER TABLE public.delivery_config REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_config;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
