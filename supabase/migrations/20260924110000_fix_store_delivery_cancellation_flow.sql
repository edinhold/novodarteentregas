-- Migration: Fix Store Delivery Request and Multi-Delivery Group Cancellation Flow
-- Resolves permission checks, multi-restaurant ownership verification, credit refund target user resolution,
-- and ensures store owners can seamlessly cancel pending or active calls and get immediate credit refunds.

-- 1. Drop existing overloaded signatures to avoid PostgREST dispatch conflicts
DROP FUNCTION IF EXISTS public.cancel_delivery_group(uuid);
DROP FUNCTION IF EXISTS public.cancel_delivery_request(uuid);

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
  v_target_owner_id uuid;
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

  IF v_group.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Esta operação multi-entregas já foi concluída ou cancelada';
  END IF;

  -- Flexible store owner check matching either group store_owner_id, restaurant owner_id, or caller store role
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
    OR public.has_role(v_user_id, 'store_owner'::app_role)
  );
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

  -- Resolve refund recipient safely
  v_target_owner_id := COALESCE(
    v_group.store_owner_id,
    (SELECT owner_id FROM public.restaurants WHERE id = v_group.restaurant_id),
    v_user_id
  );

  -- Refund credits to store owner if applicable
  IF v_group.total_cost IS NOT NULL AND v_group.total_cost > 0 AND v_target_owner_id IS NOT NULL THEN
    INSERT INTO public.store_credits (user_id, balance)
    VALUES (v_target_owner_id, v_group.total_cost)
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
  v_target_owner_id uuid;
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

  IF v_request.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Esta corrida não pode mais ser cancelada';
  END IF;

  -- If this request belongs to a multi-delivery group, cancel the whole group cleanly
  IF v_request.group_id IS NOT NULL THEN
    RETURN public.cancel_delivery_group(v_request.group_id);
  END IF;

  -- Flexible store owner check matching either request store_owner_id, restaurant owner_id, or caller store role
  v_is_store_owner := (
    v_request.store_owner_id = v_user_id
    OR (v_request.restaurant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restaurants WHERE id = v_request.restaurant_id AND owner_id = v_user_id
    ))
    OR public.has_role(v_user_id, 'store_owner'::app_role)
  );
  v_is_driver := (v_request.driver_id IS NOT NULL AND v_request.driver_id = v_user_id);

  IF NOT (v_is_store_owner OR v_is_driver OR public.has_role(v_user_id, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar esta corrida';
  END IF;

  -- Cancel single request
  UPDATE public.delivery_requests
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_request_id;

  -- Resolve refund recipient safely
  v_target_owner_id := COALESCE(
    v_request.store_owner_id,
    (SELECT owner_id FROM public.restaurants WHERE id = v_request.restaurant_id),
    v_user_id
  );

  -- Refund credits to store owner
  IF v_request.credit_cost IS NOT NULL AND v_request.credit_cost > 0 AND v_target_owner_id IS NOT NULL THEN
    INSERT INTO public.store_credits (user_id, balance)
    VALUES (v_target_owner_id, v_request.credit_cost)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.store_credits.balance + v_request.credit_cost,
        updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_delivery_request(uuid) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
