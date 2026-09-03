
CREATE OR REPLACE FUNCTION public.accept_delivery_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(v_user, 'driver'::app_role) THEN
    RAISE EXCEPTION 'Apenas motoristas podem aceitar entregas';
  END IF;

  -- Lock the row to prevent race conditions
  SELECT id, status, driver_id, driver_fee, group_id
    INTO v_req
    FROM public.delivery_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta corrida já foi assumida por outro motorista';
  END IF;

  IF v_req.driver_id IS NOT NULL AND v_req.driver_id <> v_user THEN
    RAISE EXCEPTION 'Esta corrida foi direcionada a outro motorista';
  END IF;

  UPDATE public.delivery_requests
     SET driver_id = v_user,
         status = 'accepted',
         updated_at = now()
   WHERE id = p_request_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta corrida já foi assumida por outro motorista';
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'driver_fee', v_req.driver_fee,
    'status', 'accepted'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_delivery_request(uuid) TO authenticated;
