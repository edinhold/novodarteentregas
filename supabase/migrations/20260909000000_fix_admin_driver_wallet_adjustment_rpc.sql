-- Migration: Fix Admin Driver Wallet Adjustment RPC (Normalização e Correção Atômica)

-- Drop any previous overloads of admin_adjust_driver_wallet
DROP FUNCTION IF EXISTS public.admin_adjust_driver_wallet;
DROP FUNCTION IF EXISTS public.admin_adjust_driver_wallet(uuid, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.admin_adjust_driver_wallet(uuid, text, numeric, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_adjust_driver_wallet(
  p_driver_id uuid,
  p_operation text,           -- 'add' / 'credit' or 'subtract' / 'debit'
  p_amount numeric,           -- positive numeric amount
  p_reason text,              -- mandatory justification
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_admin_email text;
  v_driver_id uuid;
  v_driver_user_id uuid;
  v_driver_name text;
  v_current_balance numeric := 0;
  v_new_balance numeric := 0;
  v_signed_amount numeric := 0;
  v_earning_id uuid;
  v_log_id uuid;
  v_adj_type text;
BEGIN
  -- 1. Security Check: Admin role required
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: Somente administradores podem realizar ajustes manuais na carteira.';
  END IF;

  -- 2. Input Validations
  IF p_driver_id IS NULL THEN
    RAISE EXCEPTION 'ID do motorista é obrigatório.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor válido e maior que zero para o ajuste.';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'O motivo/descrição do ajuste é obrigatório.';
  END IF;

  -- 3. Fetch Driver Details (Search by drivers.id OR drivers.user_id)
  SELECT id, user_id, full_name INTO v_driver_id, v_driver_user_id, v_driver_name
  FROM public.drivers
  WHERE id = p_driver_id OR user_id = p_driver_id
  LIMIT 1;

  IF v_driver_name IS NULL OR v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Motorista não encontrado no sistema.';
  END IF;

  -- Fetch Admin Email
  SELECT email INTO v_admin_email
  FROM auth.users
  WHERE id = v_admin_id;

  -- 4. Calculate Current Driver Pending Balance (SUM of status = 'pending')
  SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
  FROM public.driver_earnings
  WHERE driver_id = v_driver_id AND status = 'pending';

  v_current_balance := round(v_current_balance, 2);

  -- 5. Calculate signed amount and new balance based on operation
  IF lower(trim(p_operation)) IN ('add', 'credit', 'adicionar', 'credito', 'manual_credit') THEN
    v_signed_amount := round(abs(p_amount), 2);
    v_adj_type := 'manual_credit';
  ELSIF lower(trim(p_operation)) IN ('subtract', 'debit', 'retirar', 'remover', 'debito', 'manual_debit') THEN
    v_signed_amount := -round(abs(p_amount), 2);
    v_adj_type := 'manual_debit';
  ELSE
    RAISE EXCEPTION 'Operação inválida. Escolha adicionar (crédito) ou retirar (débito).';
  END IF;

  v_new_balance := round(v_current_balance + v_signed_amount, 2);

  -- Rule: Do not allow negative balance on debit
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Débito não permitido: o valor do ajuste (R$ %) é superior ao saldo disponível (R$ %).',
      to_char(round(abs(p_amount), 2), 'FM999G999D00'), to_char(v_current_balance, 'FM999G999D00');
  END IF;

  -- 6. Check Idempotency Key (if provided)
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_adjustment_logs
      WHERE transaction_id = trim(p_idempotency_key)
    ) THEN
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Ajuste já foi aplicado anteriormente (idempotência).',
        'driver_id', v_driver_id,
        'driver_name', v_driver_name,
        'old_balance', v_current_balance,
        'new_balance', v_current_balance
      );
    END IF;
  END IF;

  -- 7. Transactional Insert into driver_earnings (Native driver earnings table)
  INSERT INTO public.driver_earnings (
    driver_id,
    amount,
    status,
    delivery_request_id,
    description,
    adjustment_type,
    created_by_admin_id
  ) VALUES (
    v_driver_id,
    v_signed_amount,
    'pending',
    NULL, -- No delivery request linked (manual wallet adjustment)
    trim(p_reason),
    v_adj_type,
    v_admin_id
  ) RETURNING id INTO v_earning_id;

  -- 8. Transactional Insert into Audit Log
  INSERT INTO public.financial_adjustment_logs (
    admin_user_id,
    admin_email,
    transaction_id,
    driver_id,
    driver_name,
    movement_type,
    old_value,
    new_value,
    adjustment_amount,
    reason
  ) VALUES (
    v_admin_id,
    COALESCE(v_admin_email, 'admin@sistema'),
    COALESCE(trim(p_idempotency_key), 'adj-drv-' || v_earning_id::text),
    v_driver_id,
    v_driver_name,
    CASE WHEN v_signed_amount > 0 THEN 'Ajuste Manual — Crédito' ELSE 'Ajuste Manual — Débito' END,
    v_current_balance,
    v_new_balance,
    v_signed_amount,
    trim(p_reason)
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'earning_id', v_earning_id,
    'log_id', v_log_id,
    'driver_id', v_driver_id,
    'driver_name', v_driver_name,
    'operation', p_operation,
    'signed_amount', v_signed_amount,
    'old_balance', v_current_balance,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_driver_wallet(uuid, text, numeric, text, text) TO authenticated;
