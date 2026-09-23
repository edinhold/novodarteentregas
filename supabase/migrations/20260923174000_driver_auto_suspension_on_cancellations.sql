-- Migration: Driver automatic 2-hour suspension on >2 cancellations + reset on admin unblock

-- 1. Add cancellation_count, suspended_until, suspension_reason columns
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS cancellation_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cancellation_count INT NOT NULL DEFAULT 0;

-- 2. RPC function for driver dropping/cancelling an accepted delivery
CREATE OR REPLACE FUNCTION public.driver_drop_delivery(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_req RECORD;
  v_new_count int;
  v_suspended boolean := false;
  v_suspended_until timestamptz := NULL;
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

  -- Increment cancellation_count for driver
  UPDATE public.drivers
     SET cancellation_count = COALESCE(cancellation_count, 0) + 1,
         updated_at = now()
   WHERE user_id = v_user_id OR id = v_user_id
  RETURNING cancellation_count INTO v_new_count;

  UPDATE public.profiles
     SET cancellation_count = COALESCE(cancellation_count, 0) + 1,
         updated_at = now()
   WHERE user_id = v_user_id;

  -- Check if cancellation_count > 2 (i.e. 3 or more cancellations)
  IF COALESCE(v_new_count, 0) >= 3 THEN
    v_suspended := true;
    v_suspended_until := now() + interval '2 hours';

    UPDATE public.drivers
       SET suspended_until = v_suspended_until,
           suspension_reason = 'Bloqueio automático: cancelou entregas aceitas mais de 2 vezes',
           is_online = false,
           updated_at = now()
     WHERE user_id = v_user_id OR id = v_user_id;

    UPDATE public.profiles
       SET suspended_until = v_suspended_until,
           suspension_reason = 'Bloqueio automático: cancelou entregas aceitas mais de 2 vezes',
           updated_at = now()
     WHERE user_id = v_user_id;

    INSERT INTO public.user_suspension_logs (admin_user_id, target_user_id, action, reason, suspended_until)
    VALUES (v_user_id, v_user_id, 'auto_suspend', 'Bloqueio automático: cancelou entregas aceitas mais de 2 vezes', v_suspended_until);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'suspended', v_suspended,
    'cancellation_count', COALESCE(v_new_count, 0),
    'suspended_until', v_suspended_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_drop_delivery(uuid) TO authenticated, service_role;

-- 3. Trigger fallback for direct table updates unassigning driver
CREATE OR REPLACE FUNCTION public.handle_driver_cancellation_auto_suspension()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_new_count int;
  v_suspended_until timestamptz;
BEGIN
  IF OLD.driver_id IS NOT NULL AND NEW.driver_id IS NULL AND OLD.status IN ('accepted', 'picked_up') AND NEW.status = 'pending' THEN
    v_driver_id := OLD.driver_id;

    UPDATE public.drivers
       SET cancellation_count = COALESCE(cancellation_count, 0) + 1,
           updated_at = now()
     WHERE user_id = v_driver_id OR id = v_driver_id
    RETURNING cancellation_count INTO v_new_count;

    UPDATE public.profiles
       SET cancellation_count = COALESCE(cancellation_count, 0) + 1,
           updated_at = now()
     WHERE user_id = v_driver_id;

    IF COALESCE(v_new_count, 0) >= 3 THEN
      v_suspended_until := now() + interval '2 hours';

      UPDATE public.drivers
         SET suspended_until = v_suspended_until,
             suspension_reason = 'Bloqueio automático: cancelou entregas aceitas mais de 2 vezes',
             is_online = false,
             updated_at = now()
       WHERE user_id = v_driver_id OR id = v_driver_id;

      UPDATE public.profiles
         SET suspended_until = v_suspended_until,
             suspension_reason = 'Bloqueio automático: cancelou entregas aceitas mais de 2 vezes',
             updated_at = now()
       WHERE user_id = v_driver_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_cancel_request ON public.delivery_requests;
CREATE TRIGGER trg_driver_cancel_request
  AFTER UPDATE ON public.delivery_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_driver_cancellation_auto_suspension();

-- 4. Update admin_unsuspend_user to unblock AND reset cancellation_count to 0
CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (public.has_role(v_caller, 'admin'::app_role) OR v_caller = p_target_user_id) THEN
    RAISE EXCEPTION 'Apenas administradores podem reativar usuários';
  END IF;

  UPDATE public.profiles
     SET suspended_until = NULL,
         suspension_reason = NULL,
         suspended_by = NULL,
         suspended_at = NULL,
         cancellation_count = 0,
         updated_at = now()
   WHERE user_id = p_target_user_id;

  UPDATE public.drivers
     SET suspended_until = NULL,
         suspension_reason = NULL,
         cancellation_count = 0,
         is_active = true,
         updated_at = now()
   WHERE user_id = p_target_user_id OR id = p_target_user_id;

  INSERT INTO public.user_suspension_logs (admin_user_id, target_user_id, action, reason, suspended_until)
  VALUES (v_caller, p_target_user_id, 'unsuspend', NULL, NULL);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid) TO authenticated, service_role;

-- 5. Update admin_suspend_user to sync profiles AND drivers
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_target_user_id uuid,
  p_until timestamptz,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem suspender usuários';
  END IF;

  UPDATE public.profiles
     SET suspended_until = p_until,
         suspension_reason = p_reason,
         suspended_by = v_caller,
         suspended_at = now(),
         updated_at = now()
   WHERE user_id = p_target_user_id;

  UPDATE public.drivers
     SET suspended_until = p_until,
         suspension_reason = p_reason,
         is_online = false,
         updated_at = now()
   WHERE user_id = p_target_user_id OR id = p_target_user_id;

  INSERT INTO public.user_suspension_logs (admin_user_id, target_user_id, action, reason, suspended_until)
  VALUES (v_caller, p_target_user_id, 'suspend', p_reason, p_until);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, timestamptz, text) TO authenticated, service_role;
