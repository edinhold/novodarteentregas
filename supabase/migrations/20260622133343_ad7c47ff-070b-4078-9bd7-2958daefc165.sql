CREATE OR REPLACE FUNCTION public.admin_update_delivery_address(
  p_request_id uuid,
  p_pickup_address text,
  p_delivery_address text,
  p_distance_km numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_req RECORD;
  v_base_fee numeric; v_fee_per_km numeric; v_min_km numeric; v_max_km numeric; v_round_km_up boolean;
  v_effective_km numeric; v_new_cost numeric; v_diff numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem corrigir endereços';
  END IF;

  SELECT * INTO v_req FROM public.delivery_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;
  IF v_req.status IN ('delivered','cancelled') THEN
    RAISE EXCEPTION 'Não é possível corrigir endereços de entregas finalizadas';
  END IF;

  SELECT base_fee, fee_per_km, min_km, max_km, round_km_up
    INTO v_base_fee, v_fee_per_km, v_min_km, v_max_km, v_round_km_up
    FROM public.delivery_config LIMIT 1;
  v_base_fee := COALESCE(v_base_fee, 5);
  v_fee_per_km := COALESCE(v_fee_per_km, 1.5);
  v_min_km := COALESCE(v_min_km, 0);
  v_max_km := COALESCE(v_max_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  v_effective_km := COALESCE(p_distance_km, 0);
  IF v_round_km_up AND v_effective_km > 0 THEN v_effective_km := ceil(v_effective_km); END IF;
  IF v_min_km > 0 AND v_effective_km < v_min_km THEN v_effective_km := v_min_km; END IF;
  IF v_max_km > 0 AND v_effective_km > v_max_km THEN v_effective_km := v_max_km; END IF;

  v_new_cost := v_base_fee + (v_fee_per_km * v_effective_km);
  v_diff := v_new_cost - COALESCE(v_req.credit_cost, 0);

  -- Adjust store credits by the difference (refund if cheaper, charge if more expensive)
  IF v_diff <> 0 THEN
    INSERT INTO public.store_credits (user_id, balance)
    VALUES (v_req.store_owner_id, -v_diff)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.store_credits.balance - v_diff,
          updated_at = now();
  END IF;

  UPDATE public.delivery_requests
     SET pickup_address = COALESCE(p_pickup_address, pickup_address),
         delivery_address = COALESCE(p_delivery_address, delivery_address),
         credit_cost = v_new_cost,
         driver_fee = v_new_cost,
         updated_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'new_cost', v_new_cost,
    'diff', v_diff,
    'distance_km', v_effective_km
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_delivery_address(uuid, text, text, numeric) TO authenticated;