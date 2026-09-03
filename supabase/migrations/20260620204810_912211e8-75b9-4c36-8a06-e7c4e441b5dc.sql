
-- Driver accepts entire group atomically
CREATE OR REPLACE FUNCTION public.accept_delivery_group(p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF v_group.status <> 'pending' THEN RAISE EXCEPTION 'Rota não está mais disponível'; END IF;
  IF v_group.driver_id IS NOT NULL AND v_group.driver_id <> v_user_id THEN
    RAISE EXCEPTION 'Rota direcionada a outro motorista';
  END IF;

  UPDATE public.delivery_groups
    SET driver_id = v_user_id, status = 'accepted', updated_at = now()
    WHERE id = p_group_id;

  UPDATE public.delivery_requests
    SET driver_id = v_user_id, status = 'accepted', updated_at = now()
    WHERE group_id = p_group_id AND status = 'pending';

  RETURN true;
END;
$$;

-- Driver marks pickup at store for entire group
CREATE OR REPLACE FUNCTION public.pickup_delivery_group(p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT id, driver_id, status INTO v_group
  FROM public.delivery_groups WHERE id = p_group_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Rota não encontrada'; END IF;
  IF v_group.driver_id <> v_user_id THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_group.status <> 'accepted' THEN RAISE EXCEPTION 'Rota não está em status válido para coleta'; END IF;

  UPDATE public.delivery_groups
    SET status = 'picked_up', updated_at = now()
    WHERE id = p_group_id;

  UPDATE public.delivery_requests
    SET status = 'picked_up', updated_at = now()
    WHERE group_id = p_group_id AND status IN ('accepted','pending');

  RETURN true;
END;
$$;

-- Complete one stop inside a group; close group when all stops delivered
CREATE OR REPLACE FUNCTION public.complete_group_stop(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_req RECORD;
  v_driver_id uuid;
  v_app_fee_percent numeric;
  v_app_fee numeric;
  v_driver_amount numeric;
  v_remaining int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT id, driver_id, status, driver_fee, group_id
    INTO v_req
    FROM public.delivery_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Parada não encontrada'; END IF;
  IF v_req.group_id IS NULL THEN RAISE EXCEPTION 'Esta entrega não pertence a uma rota agrupada'; END IF;
  IF v_req.driver_id <> v_user_id THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_req.status = 'delivered' THEN RAISE EXCEPTION 'Parada já entregue'; END IF;

  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_user_id LIMIT 1;
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Perfil de entregador não encontrado'; END IF;

  SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent FROM public.delivery_config LIMIT 1;
  v_app_fee := (COALESCE(v_req.driver_fee, 0) * v_app_fee_percent) / 100;
  v_driver_amount := GREATEST(COALESCE(v_req.driver_fee, 0) - v_app_fee, 0);

  UPDATE public.delivery_requests
    SET status = 'delivered', updated_at = now()
    WHERE id = p_request_id;

  INSERT INTO public.driver_earnings (driver_id, delivery_request_id, amount, status)
  VALUES (v_driver_id, p_request_id, v_driver_amount, 'pending');

  SELECT count(*) INTO v_remaining
    FROM public.delivery_requests
    WHERE group_id = v_req.group_id AND status <> 'delivered';

  IF v_remaining = 0 THEN
    UPDATE public.delivery_groups
      SET status = 'delivered', updated_at = now()
      WHERE id = v_req.group_id;
  END IF;

  RETURN true;
END;
$$;

-- Realtime for groups
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_groups;
