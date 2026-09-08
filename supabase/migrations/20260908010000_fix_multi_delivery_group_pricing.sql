-- Fix Multi-Delivery Group Pricing to charge base fee ONCE and compute single route distance
CREATE OR REPLACE FUNCTION public.create_delivery_group(
  p_restaurant_id uuid,
  p_pickup_address text,
  p_stops jsonb,                -- [{delivery_address, customer_name, customer_phone, notes, distance_km}]
  p_preferred_driver_id uuid DEFAULT NULL,
  p_group_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_base_fee numeric; v_fee_per_km numeric; v_min_km numeric; v_max_km numeric; v_round_km_up boolean;
  v_balance numeric; v_total_cost numeric := 0; v_group_id uuid;
  v_stop jsonb; v_leg_km numeric; v_total_distance_km numeric := 0; v_billable_km numeric := 0;
  v_stop_cost numeric; v_stops_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_stops IS NULL OR jsonb_array_length(p_stops) = 0 THEN RAISE EXCEPTION 'Adicione pelo menos uma parada'; END IF;
  v_stops_count := jsonb_array_length(p_stops);
  IF v_stops_count > 10 THEN RAISE EXCEPTION 'Máximo de 10 paradas por rota'; END IF;

  -- 1. Obtém a regra oficial de precificação do Admin
  SELECT base_fee, fee_per_km, min_km, max_km, round_km_up
    INTO v_base_fee, v_fee_per_km, v_min_km, v_max_km, v_round_km_up
    FROM public.delivery_config LIMIT 1;
  v_base_fee := COALESCE(v_base_fee, 5.30);
  v_fee_per_km := COALESCE(v_fee_per_km, 1.70);
  v_min_km := COALESCE(v_min_km, 0);
  v_max_km := COALESCE(v_max_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  -- 2. Soma a distância total real da rota (soma dos trechos sequenciais)
  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
    v_leg_km := COALESCE((v_stop->>'distance_km')::numeric, 0);
    IF v_leg_km < 0 THEN v_leg_km := 0; END IF;
    v_total_distance_km := v_total_distance_km + v_leg_km;
  END LOOP;

  -- 3. Aplica regras de km faturável (arredondamento, mínimo, máximo)
  v_billable_km := v_total_distance_km;
  IF v_round_km_up AND v_billable_km > 0 THEN
    v_billable_km := ceil(v_billable_km);
  END IF;
  IF v_min_km > 0 AND v_billable_km < v_min_km THEN
    v_billable_km := v_min_km;
  END IF;
  IF v_max_km > 0 AND v_max_km > 0 AND v_billable_km > v_max_km THEN
    v_billable_km := v_max_km;
  END IF;

  -- 4. CÁLCULO UNIFICADO DA OPERAÇÃO: Base Fee (1x) + (Fee/km * Billable KM)
  v_total_cost := round(v_base_fee + (v_fee_per_km * v_billable_km), 2);

  -- 5. Verifica saldo e deduz UMA ÚNICA VEZ do saldo da loja
  SELECT balance INTO v_balance FROM public.store_credits WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_total_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes (Necessário R$ %, Possui R$ %)', round(v_total_cost, 2), round(COALESCE(v_balance, 0), 2);
  END IF;

  UPDATE public.store_credits SET balance = balance - v_total_cost, updated_at = now() WHERE user_id = v_user_id;

  -- 6. Registra o grupo com o custo unificado correto
  INSERT INTO public.delivery_groups (
    store_owner_id, restaurant_id, pickup_address, driver_id, total_cost, stops_count, notes
  ) VALUES (
    v_user_id, p_restaurant_id, p_pickup_address, p_preferred_driver_id, v_total_cost, v_stops_count, p_group_notes
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
      store_owner_id, restaurant_id, pickup_address, delivery_address, notes,
      credit_cost, driver_fee, status, driver_id, group_id, customer_name, customer_phone, distance_km
    ) VALUES (
      v_user_id, p_restaurant_id, p_pickup_address, v_stop->>'delivery_address', v_stop->>'notes',
      v_stop_cost, v_stop_cost, 'pending', p_preferred_driver_id, v_group_id,
      v_stop->>'customer_name', v_stop->>'customer_phone', v_leg_km
    );
  END LOOP;

  RETURN v_group_id;
END;
$$;
