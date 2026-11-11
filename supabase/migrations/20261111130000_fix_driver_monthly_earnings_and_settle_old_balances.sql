-- Migration: Fix Driver Monthly Earnings & Settle Old Balances
-- Date: 2026-11-11
-- Description:
-- 1. Settle old accumulated driver earnings from past months so they do not show up as pending/available balance.
-- 2. Update request_withdrawal RPC to strictly process current month pending earnings.
-- 3. Update sync_driver_wallet_integrity RPC to ensure old past-month earnings are settled and not restored as pending.

-- 1. Settle all pending or requested driver earnings older than the current month (America/Cuiaba timezone)
UPDATE public.driver_earnings
SET status = 'settled',
    updated_at = now()
WHERE status IN ('pending', 'requested')
  AND created_at < date_trunc('month', now() AT TIME ZONE 'America/Cuiaba');

-- 2. Update request_withdrawal RPC function with month boundary protection
CREATE OR REPLACE FUNCTION public.request_withdrawal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_driver_id uuid;
    v_total_pending numeric;
    v_payment_day integer;
    v_fixed_fee numeric;
    v_early_fee_percent numeric;
    v_fee_amount numeric;
    v_fee_percent numeric;
    v_net_amount numeric;
    v_pix_key text;
    v_pix_key_type text;
    v_today_dow integer;
    v_month_start timestamptz;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN 
        RAISE EXCEPTION 'Usuário não autenticado.'; 
    END IF;

    -- Fetch driver profile
    SELECT id, pix_key, pix_key_type INTO v_driver_id, v_pix_key, v_pix_key_type
    FROM public.drivers 
    WHERE user_id = v_user_id;

    IF v_driver_id IS NULL THEN 
        SELECT id, pix_key, pix_key_type INTO v_driver_id, v_pix_key, v_pix_key_type
        FROM public.drivers 
        WHERE id = v_user_id;
    END IF;

    IF v_driver_id IS NULL THEN 
        RAISE EXCEPTION 'Perfil de entregador não encontrado.'; 
    END IF;

    IF v_pix_key IS NULL OR trim(v_pix_key) = '' THEN 
        RAISE EXCEPTION 'Por favor, cadastre sua chave PIX antes de solicitar o saque.'; 
    END IF;

    -- Check if driver already has an unhandled pending withdrawal request
    IF EXISTS (
        SELECT 1 FROM public.withdrawal_requests 
        WHERE (driver_id = v_driver_id OR driver_user_id = v_user_id) AND status = 'pending'
    ) THEN
        RAISE EXCEPTION 'Você já possui uma solicitação de antecipação pendente. Aguarde o processamento do administrador.';
    END IF;

    -- Current month start boundary
    v_month_start := date_trunc('month', now() AT TIME ZONE 'America/Cuiaba');

    -- Auto-settle any past-month earnings older than current month
    UPDATE public.driver_earnings
    SET status = 'settled', updated_at = now()
    WHERE (driver_id = v_driver_id OR driver_id = v_user_id)
      AND status IN ('pending', 'requested')
      AND created_at < v_month_start;

    -- Revert any orphan 'requested' earnings of current month back to 'pending'
    UPDATE public.driver_earnings
    SET status = 'pending', updated_at = now()
    WHERE (driver_id = v_driver_id OR driver_id = v_user_id)
      AND status = 'requested'
      AND created_at >= v_month_start;

    -- Calculate available pending earnings balance strictly for the current month
    SELECT COALESCE(SUM(amount), 0) INTO v_total_pending
    FROM public.driver_earnings
    WHERE (driver_id = v_driver_id OR driver_id = v_user_id)
      AND status = 'pending'
      AND created_at >= v_month_start;

    IF v_total_pending <= 0 THEN 
        RAISE EXCEPTION 'Sem saldo disponível para saque no mês atual.'; 
    END IF;

    -- Fetch rate settings dynamically from delivery_config
    SELECT payment_day,
           withdrawal_fixed_fee,
           early_withdrawal_fee_percent
    INTO v_payment_day, v_fixed_fee, v_early_fee_percent
    FROM public.delivery_config 
    LIMIT 1;

    IF v_payment_day IS NULL THEN v_payment_day := 3; END IF;
    IF v_fixed_fee IS NULL THEN v_fixed_fee := 1.00; END IF;
    IF v_early_fee_percent IS NULL THEN v_early_fee_percent := 10; END IF;

    -- Get current day of week in Brazil timezone (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    v_today_dow := extract(dow from (now() AT TIME ZONE 'America/Cuiaba'))::integer;

    -- Rule: On official payment day (payment_day), charge ONLY fixed maintenance fee. Outside payment day, charge percentage.
    IF v_today_dow = v_payment_day THEN
        v_fee_percent := 0;
        v_fee_amount := v_fixed_fee;
    ELSE
        v_fee_percent := v_early_fee_percent;
        v_fee_amount := (v_total_pending * v_fee_percent) / 100.0;
    END IF;

    v_net_amount := GREATEST(v_total_pending - v_fee_amount, 0);

    -- Record withdrawal request
    INSERT INTO public.withdrawal_requests (
        driver_id,
        driver_user_id,
        amount,
        fee_percent,
        fee_amount,
        net_amount,
        pix_key,
        pix_key_type,
        status,
        created_at
    ) VALUES (
        v_driver_id,
        v_user_id,
        v_total_pending,
        v_fee_percent,
        v_fee_amount,
        v_net_amount,
        v_pix_key,
        v_pix_key_type,
        'pending',
        now()
    );

    -- Mark current month earnings as requested
    UPDATE public.driver_earnings
    SET status = 'requested', updated_at = now()
    WHERE (driver_id = v_driver_id OR driver_id = v_user_id)
      AND status = 'pending'
      AND created_at >= v_month_start;

    RETURN jsonb_build_object(
        'success', true,
        'total_amount', v_total_pending,
        'fee_amount', v_fee_amount,
        'net_amount', v_net_amount,
        'message', 'Solicitação de saque efetuada com sucesso.'
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal() TO authenticated, service_role;

-- 3. Update sync_driver_wallet_integrity RPC function with month boundary
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
  v_month_start timestamptz;
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

  v_month_start := date_trunc('month', now() AT TIME ZONE 'America/Cuiaba');

  -- Auto-settle any past-month earnings older than current month
  UPDATE public.driver_earnings
  SET status = 'settled', updated_at = now()
  WHERE (driver_id = v_driver_id OR driver_id = v_user_id)
    AND status IN ('pending', 'requested')
    AND created_at < v_month_start;

  SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent FROM public.delivery_config LIMIT 1;

  -- 1. Restaurar ganhos ausentes de corridas concluídas do mês atual
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
    AND COALESCE(r.updated_at, r.created_at) >= v_month_start
    AND NOT EXISTS (
      SELECT 1 FROM public.driver_earnings de WHERE de.delivery_request_id = r.id
    );
  GET DIAGNOSTICS v_restored_missing = ROW_COUNT;

  -- 2. Restaurar ganhos órfãos presos em 'requested' do mês atual se não houver saque 'pending'
  IF NOT EXISTS (
    SELECT 1 FROM public.withdrawal_requests 
    WHERE (driver_id = v_driver_id OR driver_user_id = v_user_id) AND status = 'pending'
  ) THEN
    UPDATE public.driver_earnings
    SET status = 'pending', updated_at = now()
    WHERE (driver_id = v_driver_id OR driver_id = v_user_id)
      AND status = 'requested'
      AND created_at >= v_month_start;
    GET DIAGNOSTICS v_reverted_requested = ROW_COUNT;
  END IF;

  -- 3. Calcular saldo pendente final do mês atual
  SELECT COALESCE(SUM(amount), 0) INTO v_pending_balance
  FROM public.driver_earnings
  WHERE (driver_id = v_driver_id OR driver_id = v_user_id)
    AND status = 'pending'
    AND created_at >= v_month_start;

  RETURN jsonb_build_object(
    'success', true,
    'restored_missing_earnings', v_restored_missing,
    'reverted_requested_earnings', v_reverted_requested,
    'current_pending_balance', v_pending_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_driver_wallet_integrity() TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
