
-- Create delivery_groups table for grouped orders
CREATE TABLE public.delivery_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_owner_id uuid NOT NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  pickup_address text NOT NULL,
  driver_id uuid,
  status text NOT NULL DEFAULT 'pending',
  total_cost numeric NOT NULL DEFAULT 0,
  stops_count int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_groups TO authenticated;
GRANT ALL ON public.delivery_groups TO service_role;

ALTER TABLE public.delivery_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their own groups"
  ON public.delivery_groups FOR SELECT TO authenticated
  USING (store_owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Drivers can view their assigned groups"
  ON public.delivery_groups FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

CREATE POLICY "Store owners can insert their own groups"
  ON public.delivery_groups FOR INSERT TO authenticated
  WITH CHECK (store_owner_id = auth.uid());

CREATE POLICY "Store owners and drivers can update related groups"
  ON public.delivery_groups FOR UPDATE TO authenticated
  USING (store_owner_id = auth.uid() OR driver_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_delivery_groups_updated_at
  BEFORE UPDATE ON public.delivery_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link individual delivery_requests to a group (nullable for backward compatibility)
ALTER TABLE public.delivery_requests
  ADD COLUMN group_id uuid REFERENCES public.delivery_groups(id) ON DELETE SET NULL,
  ADD COLUMN customer_name text,
  ADD COLUMN customer_phone text;

CREATE INDEX idx_delivery_requests_group_id ON public.delivery_requests(group_id);

-- RPC: create a grouped delivery (multi-drop) charging each stop individually
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
  v_balance numeric; v_total numeric := 0; v_group_id uuid;
  v_stop jsonb; v_km numeric; v_cost numeric; v_stops_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_stops IS NULL OR jsonb_array_length(p_stops) = 0 THEN RAISE EXCEPTION 'Adicione pelo menos uma parada'; END IF;
  v_stops_count := jsonb_array_length(p_stops);
  IF v_stops_count > 10 THEN RAISE EXCEPTION 'Máximo de 10 paradas por rota'; END IF;

  SELECT base_fee, fee_per_km, min_km, max_km, round_km_up
    INTO v_base_fee, v_fee_per_km, v_min_km, v_max_km, v_round_km_up
    FROM public.delivery_config LIMIT 1;
  v_base_fee := COALESCE(v_base_fee, 5);
  v_fee_per_km := COALESCE(v_fee_per_km, 1.5);
  v_min_km := COALESCE(v_min_km, 0);
  v_max_km := COALESCE(v_max_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  -- Compute total cost
  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
    v_km := COALESCE((v_stop->>'distance_km')::numeric, 0);
    IF v_round_km_up AND v_km > 0 THEN v_km := ceil(v_km); END IF;
    IF v_min_km > 0 AND v_km < v_min_km THEN v_km := v_min_km; END IF;
    IF v_max_km > 0 AND v_km > v_max_km THEN v_km := v_max_km; END IF;
    v_cost := v_base_fee + (v_fee_per_km * v_km);
    v_total := v_total + v_cost;
  END LOOP;

  SELECT balance INTO v_balance FROM public.store_credits WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_total THEN
    RAISE EXCEPTION 'Créditos insuficientes (Necessário R$ %, Possui R$ %)', round(v_total,2), round(COALESCE(v_balance,0),2);
  END IF;

  UPDATE public.store_credits SET balance = balance - v_total, updated_at = now() WHERE user_id = v_user_id;

  INSERT INTO public.delivery_groups (store_owner_id, restaurant_id, pickup_address, driver_id, total_cost, stops_count, notes)
    VALUES (v_user_id, p_restaurant_id, p_pickup_address, p_preferred_driver_id, v_total, v_stops_count, p_group_notes)
    RETURNING id INTO v_group_id;

  -- Create individual requests linked to the group
  FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
    v_km := COALESCE((v_stop->>'distance_km')::numeric, 0);
    IF v_round_km_up AND v_km > 0 THEN v_km := ceil(v_km); END IF;
    IF v_min_km > 0 AND v_km < v_min_km THEN v_km := v_min_km; END IF;
    IF v_max_km > 0 AND v_km > v_max_km THEN v_km := v_max_km; END IF;
    v_cost := v_base_fee + (v_fee_per_km * v_km);

    INSERT INTO public.delivery_requests (
      store_owner_id, restaurant_id, pickup_address, delivery_address, notes,
      credit_cost, driver_fee, status, driver_id, group_id, customer_name, customer_phone
    ) VALUES (
      v_user_id, p_restaurant_id, p_pickup_address, v_stop->>'delivery_address', v_stop->>'notes',
      v_cost, v_cost, 'pending', p_preferred_driver_id, v_group_id,
      v_stop->>'customer_name', v_stop->>'customer_phone'
    );
  END LOOP;

  RETURN v_group_id;
END;
$$;
