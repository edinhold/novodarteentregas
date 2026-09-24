-- Migration: Remove all driver blocking / suspension logic completely
-- Clears any existing driver suspensions and updates driver_drop_delivery to never suspend drivers.

-- 1. Unblock all existing drivers and reset cancellation counts
UPDATE public.drivers
   SET suspended_until = NULL,
       suspension_reason = NULL,
       cancellation_count = 0,
       is_active = true,
       updated_at = now();

UPDATE public.profiles
   SET suspended_until = NULL,
       suspension_reason = NULL,
       suspended_by = NULL,
       suspended_at = NULL,
       cancellation_count = 0,
       updated_at = now();

-- 2. Drop auto-suspension trigger
DROP TRIGGER IF EXISTS trg_driver_cancel_request ON public.delivery_requests;
DROP FUNCTION IF EXISTS public.handle_driver_cancellation_auto_suspension();

-- 3. Update driver_drop_delivery RPC so dropping/cancelling an accepted delivery NEVER suspends the driver
CREATE OR REPLACE FUNCTION public.driver_drop_delivery(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_req RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id, driver_id, status, group_id INTO v_req
  FROM public.delivery_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada';
  END IF;

  IF v_req.driver_id IS NULL OR v_req.driver_id <> v_user_id THEN
    RAISE EXCEPTION 'Você não é o motorista desta corrida';
  END IF;

  IF v_req.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Esta corrida não pode mais ser cancelada';
  END IF;

  -- Unassign driver and put request back to pending pool
  IF v_req.group_id IS NOT NULL THEN
    UPDATE public.delivery_groups
       SET driver_id = NULL, status = 'pending', updated_at = now()
     WHERE id = v_req.group_id;

    UPDATE public.delivery_requests
       SET driver_id = NULL, status = 'pending', updated_at = now()
     WHERE group_id = v_req.group_id;
  ELSE
    UPDATE public.delivery_requests
       SET driver_id = NULL, status = 'pending', updated_at = now()
     WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'suspended', false,
    'cancellation_count', 0,
    'suspended_until', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_drop_delivery(uuid) TO authenticated, service_role;
