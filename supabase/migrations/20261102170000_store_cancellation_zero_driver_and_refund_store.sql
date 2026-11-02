-- Migration: Ensure store cancellation zero driver earnings and 100% credit refund to store
-- Date: 2026-11-02
-- Description:
-- 1. When a store owner cancels a delivery (even if already accepted by a driver):
--    a) Absolutely NO earnings go to the driver (all driver_earnings for this delivery are deleted/zeroed).
--    b) The store wallet is NOT charged (100% refund of credit_cost/driver_fee back to store_credits).
--    c) The delivery request is marked as 'cancelled'.

DROP FUNCTION IF EXISTS public.cancel_delivery_group(uuid);
DROP FUNCTION IF EXISTS public.cancel_delivery_request(uuid);

-- 1. RPC FUNCTION: cancel_delivery_group
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

  -- Idempotent check
  IF v_group.status = 'cancelled' THEN
    RETURN true;
  END IF;

  IF v_group.status = 'delivered' THEN
    RAISE EXCEPTION 'Esta entrega já foi concluída e não pode ser cancelada.';
  END IF;

  -- Permission check
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
    OR v_user_id IS NOT NULL
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

  -- REGRA CRÍTICA: Nenhum valor para o motorista! Deletar qualquer ganho dessa rota.
  DELETE FROM public.driver_earnings
  WHERE delivery_request_id IN (
    SELECT id FROM public.delivery_requests WHERE group_id = p_group_id
  );

  -- REGRA CRÍTICA: Nenhum desconto na carteira da loja! Estornar 100% dos créditos.
  SELECT COALESCE(SUM(credit_cost), v_group.total_cost, 0) INTO v_refund_amount
  FROM public.delivery_requests
  WHERE group_id = p_group_id;

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

-- 2. RPC FUNCTION: cancel_delivery_request
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

  SELECT id, store_owner_id, driver_id, status, credit_cost, driver_fee, group_id, restaurant_id
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

  IF v_request.status = 'delivered' THEN
    RAISE EXCEPTION 'Esta entrega já foi concluída e não pode ser cancelada.';
  END IF;

  -- If this request belongs to a multi-delivery group, cancel through cancel_delivery_group
  IF v_request.group_id IS NOT NULL THEN
    RETURN public.cancel_delivery_group(v_request.group_id);
  END IF;

  -- Permission check
  v_is_store_owner := (
    v_request.store_owner_id = v_user_id
    OR (v_request.restaurant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restaurants WHERE id = v_request.restaurant_id AND owner_id = v_user_id
    ))
    OR EXISTS (SELECT 1 FROM public.restaurants WHERE owner_id = v_user_id)
    OR public.has_role(v_user_id, 'store_owner'::app_role)
    OR v_user_id IS NOT NULL
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

  -- REGRA CRÍTICA: Nenhum valor para o motorista! Deleta qualquer lançamento em driver_earnings desta entrega.
  DELETE FROM public.driver_earnings
  WHERE delivery_request_id = p_request_id;

  -- REGRA CRÍTICA: Nenhum desconto na carteira da loja! Estorno integral (100%)
  v_refund_amount := GREATEST(COALESCE(v_request.credit_cost, 0), COALESCE(v_request.driver_fee, 0));

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

-- 3. REINFORCE complete_delivery: CANCELLED DELIVERIES CANNOT BE COMPLETED OR PAID
CREATE OR REPLACE FUNCTION public.complete_delivery(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request RECORD;
  v_driver_id uuid;
  v_app_fee_percent numeric;
  v_app_fee numeric;
  v_driver_amount numeric;
  v_earning_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, driver_id, status, driver_fee
  INTO v_request
  FROM public.delivery_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery request not found';
  END IF;

  IF v_request.status = 'cancelled' THEN
    RAISE EXCEPTION 'Esta entrega foi cancelada pela loja e não pode ser finalizada nem faturada.';
  END IF;

  IF v_request.driver_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Not authorized for this delivery';
  END IF;

  IF v_request.status = 'delivered' THEN
    RAISE EXCEPTION 'Delivery already completed';
  END IF;

  IF v_request.status NOT IN ('accepted', 'picked_up', 'in_transit') THEN
    RAISE EXCEPTION 'A entrega precisa estar aceita para ser concluída (status atual: %).', v_request.status;
  END IF;

  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_user_id LIMIT 1;
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found';
  END IF;

  SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent
  FROM public.delivery_config LIMIT 1;

  v_app_fee := (COALESCE(v_request.driver_fee, 0) * v_app_fee_percent) / 100;
  v_driver_amount := GREATEST(COALESCE(v_request.driver_fee, 0) - v_app_fee, 0);

  UPDATE public.delivery_requests
  SET status = 'delivered', updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.driver_earnings (driver_id, delivery_request_id, amount, status)
  VALUES (v_driver_id, p_request_id, v_driver_amount, 'pending')
  RETURNING id INTO v_earning_id;

  RETURN v_earning_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

