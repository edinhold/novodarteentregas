-- Migration: Remove o teto max_km para garantir cálculo rigoroso de TODA a quilometragem rodada (> 2.5 km)

-- 1. Zera qualquer max_km salvo na configuração do admin
UPDATE public.delivery_config
SET max_km = 0,
    updated_at = now()
WHERE COALESCE(max_km, 0) > 0;

-- 2. Atualiza deduct_credits_for_delivery sem truncamento por max_km
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
    RAISE EXCEPTION 'Sem permissão para chamar entregador para esta loja';
  END IF;

  IF v_store_lat IS NULL OR v_store_lng IS NULL OR v_store_lat < -15.80 OR v_store_lat > -15.35 OR v_store_lng < -54.55 OR v_store_lng > -54.05 THEN
    SELECT latitude, longitude INTO v_store_lat, v_store_lng
    FROM public.restaurants
    WHERE owner_id = v_store_owner_id
    LIMIT 1;
  END IF;

  IF v_store_lat IS NULL OR v_store_lng IS NULL THEN
    v_store_lat := -15.5561;
    v_store_lng := -54.3011;
  END IF;

  SELECT
    base_fee,
    fee_per_km,
    dynamic_pricing_enabled,
    dynamic_fee_per_km,
    min_km,
    round_km_up
  INTO
    v_base_fee,
    v_fee_per_km,
    v_dynamic_pricing_enabled,
    v_dynamic_fee_per_km,
    v_min_km,
    v_round_km_up
  FROM public.delivery_config
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  v_base_fee := COALESCE(v_base_fee, 5.40);
  IF v_base_fee <= 0 THEN v_base_fee := 5.40; END IF;

  v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
  IF v_fee_per_km <= 0 THEN v_fee_per_km := 1.70; END IF;

  v_dynamic_pricing_enabled := COALESCE(v_dynamic_pricing_enabled, false);
  v_dynamic_fee_per_km := COALESCE(v_dynamic_fee_per_km, 0);

  IF v_dynamic_pricing_enabled IS TRUE AND v_dynamic_fee_per_km > 0 THEN
    v_effective_fee_per_km := v_fee_per_km + v_dynamic_fee_per_km;
  ELSE
    v_effective_fee_per_km := v_fee_per_km;
  END IF;

  IF v_effective_fee_per_km <= 0 THEN v_effective_fee_per_km := 1.70; END IF;

  v_min_km := COALESCE(v_min_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  v_effective_km := COALESCE(p_distance_km, 0);

  IF v_effective_km <= 0 THEN
    IF v_min_km > 0 THEN
      v_effective_km := v_min_km;
    ELSE
      v_effective_km := 1.0;
    END IF;
  END IF;

  IF v_round_km_up AND v_effective_km > 0 THEN
    v_effective_km := ceil(v_effective_km);
  ELSIF v_effective_km > 0 THEN
    v_effective_km := round(v_effective_km, 1);
  END IF;

  IF v_min_km > 0 AND v_effective_km < v_min_km THEN
    v_effective_km := v_min_km;
  END IF;

  v_delivery_cost := round(v_base_fee + (v_effective_fee_per_km * v_effective_km), 2);

  SELECT balance INTO v_current_credits
  FROM public.store_credits
  WHERE user_id = v_store_owner_id;

  IF v_current_credits IS NULL OR v_current_credits < v_delivery_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes (Necessário R$ %, Possui R$ %)', round(v_delivery_cost, 2), round(COALESCE(v_current_credits, 0), 2);
  END IF;

  UPDATE public.store_credits
  SET balance = balance - v_delivery_cost,
      updated_at = now()
  WHERE user_id = v_store_owner_id;

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

-- 3. Atualiza create_delivery_group sem truncamento por max_km
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

  SELECT
    base_fee,
    fee_per_km,
    min_km,
    round_km_up,
    dynamic_pricing_enabled,
    dynamic_fee_per_km
  INTO
    v_base_fee,
    v_fee_per_km,
    v_min_km,
    v_round_km_up,
    v_dynamic_pricing_enabled,
    v_dynamic_fee_per_km
  FROM public.delivery_config
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  v_base_fee := COALESCE(v_base_fee, 5.40);
  IF v_base_fee <= 0 THEN v_base_fee := 5.40; END IF;

  v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
  IF v_fee_per_km <= 0 THEN v_fee_per_km := 1.70; END IF;

  v_dynamic_pricing_enabled := COALESCE(v_dynamic_pricing_enabled, false);
  v_dynamic_fee_per_km := COALESCE(v_dynamic_fee_per_km, 0);

  IF v_dynamic_pricing_enabled IS TRUE AND v_dynamic_fee_per_km > 0 THEN
    v_effective_fee_per_km := v_fee_per_km + v_dynamic_fee_per_km;
  ELSE
    v_effective_fee_per_km := v_fee_per_km;
  END IF;

  v_min_km := COALESCE(v_min_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

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
  ELSIF v_total_distance > 0 THEN
    v_total_distance := round(v_total_distance, 1);
  END IF;

  IF v_min_km > 0 AND v_total_distance < v_min_km THEN
    v_total_distance := v_min_km;
  END IF;

  v_total_cost := round(v_base_fee + (v_effective_fee_per_km * v_total_distance), 2);

  SELECT balance INTO v_current_credits
  FROM public.store_credits
  WHERE user_id = v_store_owner_id;

  IF v_current_credits IS NULL OR v_current_credits < v_total_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes para o grupo (Necessário R$ %, Possui R$ %)', v_total_cost, COALESCE(v_current_credits, 0);
  END IF;

  UPDATE public.store_credits
  SET balance = balance - v_total_cost,
      updated_at = now()
  WHERE user_id = v_store_owner_id;

  v_cost_per_item := round(v_total_cost / v_items_count, 2);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_index := v_item_index + 1;
    v_pickup_address := v_item->>'pickup_address';
    v_delivery_address := v_item->>'delivery_address';
    v_notes := COALESCE(v_item->>'notes', p_notes);
    v_distance_km := COALESCE((v_item->>'distance_km')::numeric, round(v_total_distance / v_items_count, 1));

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
    'items_count', v_items_count,
    'created_ids', v_created_ids
  );
END;
$$;
