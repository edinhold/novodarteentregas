-- Migration to update accept_delivery_request RPC for robust parameter compatibility
DROP FUNCTION IF EXISTS public.accept_delivery_request(uuid);
DROP FUNCTION IF EXISTS public.accept_delivery_request(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.accept_delivery_request(
  p_request_id uuid DEFAULT NULL,
  p_pedido_id uuid DEFAULT NULL,
  p_motorista_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_req_id uuid := COALESCE(p_request_id, p_pedido_id);
  v_req RECORD;
BEGIN
  v_user := COALESCE(auth.uid(), p_motorista_id);

  IF v_req_id IS NULL THEN
    RAISE EXCEPTION 'ID da entrega não informado';
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.has_role(v_user, 'driver'::app_role) THEN
    RAISE EXCEPTION 'Apenas motoristas podem aceitar entregas';
  END IF;

  -- Lock the row to prevent race conditions (exclusive lock)
  SELECT id, status, driver_id, driver_fee, group_id
    INTO v_req
    FROM public.delivery_requests
    WHERE id = v_req_id
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
         accepted_at = COALESCE(accepted_at, now()),
         updated_at = now()
   WHERE id = v_req_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta corrida já foi assumida por outro motorista';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'accepted', true,
    'request_id', v_req_id,
    'driver_fee', v_req.driver_fee,
    'status', 'accepted'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_delivery_request(uuid, uuid, uuid) TO authenticated, service_role, anon;
