-- Migration: Ensure sync_driver_wallet_integrity RPC exists and reload PostgREST schema cache
-- Fixes "Could not find the function public.sync_driver_wallet_integrity without parameters in the schema cache"

CREATE OR REPLACE FUNCTION public.sync_driver_wallet_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_driver_id uuid;
  v_restored_missing integer := 0;
  v_reverted_requested integer := 0;
  v_pending_balance numeric := 0;
  v_app_fee_percent numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_user_id LIMIT 1;
  IF v_driver_id IS NULL THEN
    SELECT id INTO v_driver_id FROM public.drivers WHERE id = v_user_id LIMIT 1;
  END IF;

  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil de motorista não encontrado');
  END IF;

  SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent FROM public.delivery_config LIMIT 1;

  -- 1. Restaurar ganhos ausentes de corridas concluídas
  INSERT INTO public.driver_earnings (
    driver_id,
    delivery_request_id,
    amount,
    status,
    created_at,
    updated_at
  )
  SELECT
    v_driver_id,
    r.id,
    GREATEST(COALESCE(r.driver_fee, 0) - ((COALESCE(r.driver_fee, 0) * v_app_fee_percent) / 100), 0),
    'pending',
    COALESCE(r.updated_at, now()),
    now()
  FROM public.delivery_requests r
  WHERE (r.driver_id = v_driver_id OR r.driver_id = v_user_id)
    AND r.status = 'delivered'
    AND NOT EXISTS (
      SELECT 1 FROM public.driver_earnings de WHERE de.delivery_request_id = r.id
    );
  GET DIAGNOSTICS v_restored_missing = ROW_COUNT;

  -- 2. Restaurar ganhos órfãos presos em 'requested' se não houver saque 'pending'
  IF NOT EXISTS (
    SELECT 1 FROM public.withdrawal_requests 
    WHERE (driver_id = v_driver_id OR driver_user_id = v_user_id) AND status = 'pending'
  ) THEN
    UPDATE public.driver_earnings
    SET status = 'pending', updated_at = now()
    WHERE (driver_id = v_driver_id OR driver_id = v_user_id) AND status = 'requested';
    GET DIAGNOSTICS v_reverted_requested = ROW_COUNT;
  END IF;

  -- 3. Calcular saldo pendente final
  SELECT COALESCE(SUM(amount), 0) INTO v_pending_balance
  FROM public.driver_earnings
  WHERE (driver_id = v_driver_id OR driver_id = v_user_id) AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'restored_missing_earnings', v_restored_missing,
    'reverted_requested_earnings', v_reverted_requested,
    'current_pending_balance', v_pending_balance
  );
END;
$$;

-- Permissões explícitas de execução
GRANT EXECUTE ON FUNCTION public.sync_driver_wallet_integrity() TO authenticated, service_role, anon;

-- Notifica o PostgREST para recarregar o cache de schemas e reconhecer a nova função imediatamente
NOTIFY pgrst, 'reload schema';

