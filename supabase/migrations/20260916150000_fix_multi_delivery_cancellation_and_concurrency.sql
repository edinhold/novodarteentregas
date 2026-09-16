-- Migration: Fix Multi-Delivery Group Cancellation and Atomic Concurrent Acceptance
-- Ensures cancelling a multi-delivery group or request cancels ALL stops without leaving any behind.
-- Ensures accepting a multi-delivery group or request locks the group atomically for ONE driver.

-- 1. DROP overload signatures to prevent ambiguous PostgREST RPC dispatch
DROP FUNCTION IF EXISTS public.cancel_delivery_group(uuid);
DROP FUNCTION IF EXISTS public.cancel_delivery_request(uuid);
DROP FUNCTION IF EXISTS public.accept_delivery_request(uuid);
DROP FUNCTION IF EXISTS public.accept_delivery_request(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.accept_delivery_group(uuid);

-- 2. CREATE RPC FUNCTION: cancel_delivery_group
CREATE OR REPLACE FUNCTION public.cancel_delivery_group(p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group RECORD;
  v_is_store_owner boolean;
  v_is_admin boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id, store_owner_id, driver_id, status, total_cost
    INTO v_group
    FROM public.delivery_groups
    WHERE id = p_group_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;

  IF v_group.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Esta operação multi-entregas já foi concluída ou cancelada';
  END IF;

  v_is_store_owner := (v_group.store_owner_id = v_user_id);
  v_is_admin := public.has_role(v_user_id, 'admin'::app_role);

  IF NOT (v_is_store_owner OR v_is_admin OR (v_group.driver_id IS NOT NULL AND v_group.driver_id = v_user_id)) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar esta operação';
  END IF;

  -- Update delivery_groups status
  UPDATE public.delivery_groups
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_group_id;

  -- Update ALL delivery_requests in this group that are not delivered
  UPDATE public.delivery_requests
    SET status = 'cancelled', updated_at = now()
    WHERE group_id = p_group_id AND status <> 'delivered';

  -- Refund credits to store owner if applicable
  IF v_group.total_cost IS NOT NULL AND v_group.total_cost > 0 AND v_group.store_owner_id IS NOT NULL THEN
    INSERT INTO public.store_credits (user_id, balance)
    VALUES (v_group.store_owner_id, v_group.total_cost)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.store_credits.balance + v_group.total_cost,
        updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_delivery_group(uuid) TO authenticated, service_role, anon;

-- 3. CREATE RPC FUNCTION: cancel_delivery_request
CREATE OR REPLACE FUNCTION public.cancel_delivery_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request RECORD;
  v_is_store_owner boolean;
  v_is_driver boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id, store_owner_id, driver_id, status, credit_cost, group_id
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

  -- If this request belongs to a multi-delivery group, cancel the whole group cleanly
  IF v_request.group_id IS NOT NULL THEN
    RETURN public.cancel_delivery_group(v_request.group_id);
  END IF;

  v_is_store_owner := (v_request.store_owner_id = v_user_id);
  v_is_driver := (v_request.driver_id IS NOT NULL AND v_request.driver_id = v_user_id);

  IF NOT (v_is_store_owner OR v_is_driver OR public.has_role(v_user_id, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar esta corrida';
  END IF;

  -- Cancel single request
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

GRANT EXECUTE ON FUNCTION public.cancel_delivery_request(uuid) TO authenticated, service_role, anon;

-- 4. CREATE RPC FUNCTION: accept_delivery_request
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
  v_group RECORD;
BEGIN
  v_user := COALESCE(auth.uid(), p_motorista_id);

  IF v_req_id IS NULL THEN
    RAISE EXCEPTION 'ID da entrega não informado';
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(v_user, 'driver'::app_role) THEN
    RAISE EXCEPTION 'Apenas motoristas podem aceitar entregas';
  END IF;

  -- Lock request row to prevent race conditions
  SELECT id, status, driver_id, driver_fee, group_id
    INTO v_req
    FROM public.delivery_requests
    WHERE id = v_req_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta corrida já foi assumida por outro motorista ou cancelada';
  END IF;

  IF v_req.driver_id IS NOT NULL AND v_req.driver_id <> v_user THEN
    RAISE EXCEPTION 'Esta corrida foi direcionada a outro motorista';
  END IF;

  -- If request belongs to a multi-delivery group, check and accept the ENTIRE group atomically
  IF v_req.group_id IS NOT NULL THEN
    SELECT id, status, driver_id INTO v_group
      FROM public.delivery_groups
      WHERE id = v_req.group_id
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rota de multi-entregas não encontrada';
    END IF;

    IF v_group.status <> 'pending' THEN
      RAISE EXCEPTION 'Esta rota de multi-entregas já foi assumida por outro motorista ou cancelada';
    END IF;

    IF v_group.driver_id IS NOT NULL AND v_group.driver_id <> v_user THEN
      RAISE EXCEPTION 'Esta rota foi direcionada a outro motorista';
    END IF;

    -- Update delivery group
    UPDATE public.delivery_groups
       SET driver_id = v_user,
           status = 'accepted',
           updated_at = now()
     WHERE id = v_req.group_id
       AND status = 'pending';

    -- Update ALL pending requests in this group to accepted for this driver
    UPDATE public.delivery_requests
       SET driver_id = v_user,
           status = 'accepted',
           accepted_at = COALESCE(accepted_at, now()),
           updated_at = now()
     WHERE group_id = v_req.group_id
       AND status = 'pending';

  ELSE
    -- Single request without group
    UPDATE public.delivery_requests
       SET driver_id = v_user,
           status = 'accepted',
           accepted_at = COALESCE(accepted_at, now()),
           updated_at = now()
     WHERE id = v_req_id
       AND status = 'pending';
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

-- 5. CREATE RPC FUNCTION: accept_delivery_group
CREATE OR REPLACE FUNCTION public.accept_delivery_group(p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_user_id, 'driver'::app_role) THEN
    RAISE EXCEPTION 'Apenas motoristas podem aceitar entregas';
  END IF;

  SELECT id, driver_id, status INTO v_group
  FROM public.delivery_groups WHERE id = p_group_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Rota não encontrada'; END IF;
  IF v_group.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta rota de multi-entregas já foi assumida por outro motorista ou cancelada';
  END IF;
  IF v_group.driver_id IS NOT NULL AND v_group.driver_id <> v_user_id THEN
    RAISE EXCEPTION 'Rota direcionada a outro motorista';
  END IF;

  UPDATE public.delivery_groups
    SET driver_id = v_user_id, status = 'accepted', updated_at = now()
    WHERE id = p_group_id AND status = 'pending';

  UPDATE public.delivery_requests
    SET driver_id = v_user_id, status = 'accepted', accepted_at = COALESCE(accepted_at, now()), updated_at = now()
    WHERE group_id = p_group_id AND status = 'pending';

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_delivery_group(uuid) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
