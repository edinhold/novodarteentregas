
CREATE OR REPLACE FUNCTION public.cancel_delivery_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_request RECORD;
  v_is_store_owner boolean;
  v_is_driver boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id, store_owner_id, driver_id, status, credit_cost
  INTO v_request
  FROM public.delivery_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_request.status IN ('delivered','cancelled') THEN
    RAISE EXCEPTION 'Esta corrida não pode mais ser cancelada';
  END IF;

  v_is_store_owner := (v_request.store_owner_id = v_user_id);
  v_is_driver := (v_request.driver_id IS NOT NULL AND v_request.driver_id = v_user_id);

  IF NOT (v_is_store_owner OR v_is_driver OR public.has_role(v_user_id, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar esta corrida';
  END IF;

  -- Cancel the request
  UPDATE public.delivery_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_request_id;

  -- Refund credits to store owner
  IF v_request.credit_cost IS NOT NULL AND v_request.credit_cost > 0 THEN
    INSERT INTO public.store_credits (user_id, balance)
    VALUES (v_request.store_owner_id, v_request.credit_cost)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.store_credits.balance + v_request.credit_cost,
        updated_at = now();
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_delivery_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_delivery_request(uuid) TO authenticated;
