-- Migration: Fix complete store and user deletion with financial history preservation
-- Ensures store/lojista accounts can be completely deleted from auth.users, profiles, user_roles and restaurants,
-- while unlinking historical financial transactions so stats are preserved and credentials (email/phone) are freed.

-- 1. Ensure RLS policies allow Administrators to view and DELETE profiles & user_roles
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
CREATE POLICY "Admins can manage profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage user_roles" ON public.user_roles;
CREATE POLICY "Admins can manage user_roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Atomic security definer cascade function for complete deletion
CREATE OR REPLACE FUNCTION public.admin_delete_user_cascade(
  p_target_user_id UUID,
  p_target_restaurant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_restaurant_ids UUID[];
  v_driver_id UUID;
  v_deleted_store_count INT := 0;
  v_deleted_user_count INT := 0;
BEGIN
  -- Verify caller is admin if called within auth context
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar esta operação.';
  END IF;

  IF p_target_user_id IS NULL AND p_target_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetros inválidos: informe p_target_user_id ou p_target_restaurant_id.';
  END IF;

  -- Collect restaurant IDs owned by the user or specified by parameter
  SELECT ARRAY_AGG(id) INTO v_restaurant_ids
  FROM public.restaurants
  WHERE (p_target_user_id IS NOT NULL AND owner_id = p_target_user_id)
     OR (p_target_restaurant_id IS NOT NULL AND id = p_target_restaurant_id);

  -- Get driver internal id if user is also a driver
  IF p_target_user_id IS NOT NULL THEN
    SELECT id INTO v_driver_id
    FROM public.drivers
    WHERE user_id = p_target_user_id
    LIMIT 1;
  END IF;

  -- A. UNLINK HISTORICAL FINANCIAL & AUDIT TRANSACTIONS (Preserve financial records)
  IF p_target_user_id IS NOT NULL THEN
    -- Orders: unlink user reference
    UPDATE public.orders
    SET user_id = NULL
    WHERE user_id = p_target_user_id;

    -- Delivery requests: unlink store owner and driver
    UPDATE public.delivery_requests
    SET store_owner_id = NULL
    WHERE store_owner_id = p_target_user_id;

    UPDATE public.delivery_requests
    SET driver_id = NULL
    WHERE driver_id = p_target_user_id;

    -- Store recharges: unlink store owner
    UPDATE public.store_recharges
    SET store_owner_id = NULL
    WHERE store_owner_id = p_target_user_id;

    -- Credit codes: unlink user references
    UPDATE public.credit_codes
    SET used_by = NULL
    WHERE used_by = p_target_user_id;

    UPDATE public.credit_codes
    SET assigned_to_user_id = NULL
    WHERE assigned_to_user_id = p_target_user_id;

    -- Delivery groups: unlink store owner
    UPDATE public.delivery_groups
    SET store_owner_id = NULL
    WHERE store_owner_id = p_target_user_id;

    -- Withdrawal requests: unlink driver user id
    UPDATE public.withdrawal_requests
    SET driver_user_id = NULL
    WHERE driver_user_id = p_target_user_id;
  END IF;

  IF v_restaurant_ids IS NOT NULL AND ARRAY_LENGTH(v_restaurant_ids, 1) > 0 THEN
    -- Unlink restaurant references in orders, delivery_requests, store_recharges, credit_codes, delivery_groups
    UPDATE public.orders
    SET restaurant_id = NULL
    WHERE restaurant_id = ANY(v_restaurant_ids);

    UPDATE public.delivery_requests
    SET restaurant_id = NULL
    WHERE restaurant_id = ANY(v_restaurant_ids);

    UPDATE public.store_recharges
    SET restaurant_id = NULL
    WHERE restaurant_id = ANY(v_restaurant_ids);

    UPDATE public.credit_codes
    SET restaurant_id = NULL
    WHERE restaurant_id = ANY(v_restaurant_ids);

    UPDATE public.delivery_groups
    SET restaurant_id = NULL
    WHERE restaurant_id = ANY(v_restaurant_ids);
  END IF;

  IF v_driver_id IS NOT NULL THEN
    UPDATE public.withdrawal_requests
    SET driver_id = NULL
    WHERE driver_id = v_driver_id;

    UPDATE public.driver_earnings
    SET driver_id = NULL
    WHERE driver_id = v_driver_id;
  END IF;

  -- B. DELETE NON-FINANCIAL & TRANSIENT DEPENDENT RECORDS
  IF p_target_user_id IS NOT NULL THEN
    DELETE FROM public.chat_messages WHERE sender_id = p_target_user_id;
    DELETE FROM public.driver_locations WHERE user_id = p_target_user_id;
    DELETE FROM public.push_subscriptions WHERE user_id = p_target_user_id;
    DELETE FROM public.driver_push_devices WHERE driver_id = p_target_user_id OR external_id = p_target_user_id;
    DELETE FROM public.location_reports WHERE reporter_id = p_target_user_id;
    DELETE FROM public.admin_requests WHERE user_id = p_target_user_id;
    DELETE FROM public.store_credits WHERE user_id = p_target_user_id;
    DELETE FROM public.user_roles WHERE user_id = p_target_user_id;
    DELETE FROM public.drivers WHERE user_id = p_target_user_id;
  END IF;

  IF v_restaurant_ids IS NOT NULL AND ARRAY_LENGTH(v_restaurant_ids, 1) > 0 THEN
    DELETE FROM public.store_driver_favorites WHERE restaurant_id = ANY(v_restaurant_ids);
    DELETE FROM public.products WHERE restaurant_id = ANY(v_restaurant_ids);
    DELETE FROM public.restaurants WHERE id = ANY(v_restaurant_ids);
    GET DIAGNOSTICS v_deleted_store_count = ROW_COUNT;
  END IF;

  -- C. DELETE ACTIVE USER PROFILE AND AUTH RECORD
  IF p_target_user_id IS NOT NULL THEN
    DELETE FROM public.profiles WHERE user_id = p_target_user_id;
    DELETE FROM auth.users WHERE id = p_target_user_id;
    GET DIAGNOSTICS v_deleted_user_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', p_target_user_id,
    'deleted_stores_count', v_deleted_store_count,
    'deleted_user_count', v_deleted_user_count
  );
END;
$$;

-- Grant execute permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.admin_delete_user_cascade(UUID, UUID) TO authenticated, service_role;
