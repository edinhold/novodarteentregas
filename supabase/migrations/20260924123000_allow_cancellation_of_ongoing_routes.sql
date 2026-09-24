-- Migration: Allow Store Owners and Admins to Cancel Ongoing Deliveries and Multi-Delivery Routes
-- Removes restrictive status blocks preventing cancellation of in-progress ('accepted', 'picked_up') routes,
-- cleans up pending driver earnings for cancelled stops, and refunds credits back to store wallet.

DROP FUNCTION IF EXISTS public.cancel_delivery_group(uuid);
DROP FUNCTION IF EXISTS public.cancel_delivery_request(uuid);

-- 1. CREATE RPC FUNCTION: cancel_delivery_group
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
  v_is_driver boolean;
  v_is_admin boolean;
  v_target_owner_id uuid;
  v_refund_amount numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id, store_owner_id, driver_id, status, total_cost, restaurant_id
    INTO v_group
    FROM public.delivery_groups
    WHERE id = p_group_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota de entregas não encontrada';
  END IF;

  -- Idempotent check: if already cancelled, return success immediately
  IF v_group.status = 'cancelled' THEN
    RETURN true;
  END IF;

  -- Permission check: match store_owner_id, restaurant owner, store role, assigned driver, or admin
  v_is_store_owner := (
    v_group.store_owner_id = v_user_id
    OR (v_group.restaurant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restaurants WHERE id = v_group.restaurant_id AND owner_id = v_user_id
    ))
    OR EXISTS (
      SELECT 1 FROM public.restaurants r 
      WHERE r.owner_id = v_user_id 
      AND r.id IN (SELECT restaurant_id FROM public.delivery_requests WHERE group_id = p_group_id)
    )
    OR EXISTS (SELECT 1 FROM public.restaurants WHERE owner_id = v_user_id)
    OR public.has_role(v_user_id, 'store_owner'::app_role)
  );
  v_is_driver := (v_group.driver_id IS NOT NULL AND v_group.driver_id = v_user_id);
  v_is_admin := public.has_role(v_user_id, 'admin'::app_role);

  IF NOT (v_is_store_owner OR v_is_driver OR v_is_admin) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar esta operação';
  END IF;

  -- Update delivery_groups status to cancelled
  UPDATE public.delivery_groups
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_group_id;

  -- Update ALL non-delivered delivery_requests in this group to cancelled
  UPDATE public.delivery_requests
    SET status = 'cancelled', updated_at = now()
    WHERE group_id = p_group_id AND status <> 'delivered';

  -- Remove pending driver earnings for cancelled requests in this group
  DELETE FROM public.driver_earnings
  WHERE delivery_request_id IN (
    SELECT id FROM public.delivery_requests WHERE group_id = p_group_id AND status = 'cancelled'
  ) AND status = 'pending';

  -- Calculate refund amount for undelivered stops or full group
  SELECT COALESCE(SUM(credit_cost), v_group.total_cost, 0) INTO v_refund_amount
  FROM public.delivery_requests
  WHERE group_id = p_group_id AND status = 'cancelled';

  IF (v_refund_amount IS NULL OR v_refund_amount <= 0) AND v_group.total_cost IS NOT NULL AND v_group.total_cost > 0 THEN
    v_refund_amount := v_group.total_cost;
  END IF;

  -- Resolve refund recipient safely
  v_target_owner_id := COALESCE(
    v_group.store_owner_id,
    (SELECT owner_id FROM public.restaurants WHERE id = v_group.restaurant_id),
    (SELECT owner_id FROM public.restaurants WHERE owner_id = v_user_id LIMIT 1),
    v_user_id
  );

  -- Refund credits to store owner wallet
  IF v_refund_amount > 0 AND v_target_owner_id IS NOT NULL THEN
    INSERT INTO public.store_credits (user_id, balance)
    VALUES (v_target_owner_id, v_refund_amount)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.store_credits.balance + v_refund_amount,
        updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_delivery_group(uuid) TO authenticated, service_role, anon;

-- 2. CREATE RPC FUNCTION: cancel_delivery_request
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
  v_is_admin boolean;
  v_target_owner_id uuid;
  v_refund_amount numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id, store_owner_id, driver_id, status, credit_cost, group_id, restaurant_id
    INTO v_request
    FROM public.delivery_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação de entrega não encontrada';
  END IF;

  -- Idempotent check: if already cancelled, return success immediately
  IF v_request.status = 'cancelled' THEN
    RETURN true;
  END IF;

  -- If this request belongs to a multi-delivery group, cancel through cancel_delivery_group
  IF v_request.group_id IS NOT NULL THEN
    RETURN public.cancel_delivery_group(v_request.group_id);
  END IF;

  -- Permission check: match store_owner_id, restaurant owner, store role, assigned driver, or admin
  v_is_store_owner := (
    v_request.store_owner_id = v_user_id
    OR (v_request.restaurant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restaurants WHERE id = v_request.restaurant_id AND owner_id = v_user_id
    ))
    OR EXISTS (SELECT 1 FROM public.restaurants WHERE owner_id = v_user_id)
    OR public.has_role(v_user_id, 'store_owner'::app_role)
  );
  v_is_driver := (v_request.driver_id IS NOT NULL AND v_request.driver_id = v_user_id);
  v_is_admin := public.has_role(v_user_id, 'admin'::app_role);

  IF NOT (v_is_store_owner OR v_is_driver OR v_is_admin) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar esta corrida';
  END IF;

  -- Cancel single request
  UPDATE public.delivery_requests
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_request_id;

  -- Remove pending driver earnings for this cancelled request if any
  DELETE FROM public.driver_earnings
  WHERE delivery_request_id = p_request_id AND status = 'pending';

  v_refund_amount := COALESCE(v_request.credit_cost, 0);

  -- Resolve refund recipient safely
  v_target_owner_id := COALESCE(
    v_request.store_owner_id,
    (SELECT owner_id FROM public.restaurants WHERE id = v_request.restaurant_id),
    (SELECT owner_id FROM public.restaurants WHERE owner_id = v_user_id LIMIT 1),
    v_user_id
  );

  -- Refund credits to store owner wallet
  IF v_refund_amount > 0 AND v_target_owner_id IS NOT NULL THEN
    INSERT INTO public.store_credits (user_id, balance)
    VALUES (v_target_owner_id, v_refund_amount)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.store_credits.balance + v_refund_amount,
        updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_delivery_request(uuid) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
