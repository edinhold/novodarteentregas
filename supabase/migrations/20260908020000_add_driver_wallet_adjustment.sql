-- Migration: Admin Driver Wallet Adjustment (Ajuste Manual da Carteira do Motorista)

-- 1. Add description, adjustment_type, and created_by_admin_id columns to driver_earnings
ALTER TABLE public.driver_earnings
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS adjustment_type text,
  ADD COLUMN IF NOT EXISTS created_by_admin_id uuid;

-- 2. Enhance financial_adjustment_logs table for driver wallet adjustments
ALTER TABLE public.financial_adjustment_logs
  ADD COLUMN IF NOT EXISTS driver_id uuid,
  ADD COLUMN IF NOT EXISTS driver_name text;

-- 3. Create RPC admin_adjust_driver_wallet for atomic, safe manual wallet adjustments
CREATE OR REPLACE FUNCTION public.admin_adjust_driver_wallet(
  p_driver_id uuid,
  p_operation text,           -- 'add' / 'credit' or 'subtract' / 'debit'
  p_amount numeric,           -- positive amount
  p_reason text,              -- mandatory description
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_admin_email text;
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

  -- 3. Fetch Driver Details
  SELECT user_id, full_name INTO v_driver_user_id, v_driver_name
  FROM public.drivers
  WHERE id = p_driver_id;

  IF v_driver_name IS NULL THEN
    RAISE EXCEPTION 'Motorista não encontrado.';
  END IF;

  -- Fetch Admin Email
  SELECT email INTO v_admin_email
  FROM auth.users
  WHERE id = v_admin_id;

  -- 4. Calculate Current Driver Pending Balance
  SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
  FROM public.driver_earnings
  WHERE driver_id = p_driver_id AND status = 'pending';

  -- 5. Calculate signed amount and new balance based on operation
  IF p_operation IN ('add', 'credit', 'adicionar') THEN
    v_signed_amount := round(abs(p_amount), 2);
    v_adj_type := 'manual_credit';
  ELSIF p_operation IN ('subtract', 'debit', 'retirar', 'remover') THEN
    v_signed_amount := -round(abs(p_amount), 2);
    v_adj_type := 'manual_debit';
  ELSE
    RAISE EXCEPTION 'Operação inválida. Escolha adicionar ou retirar.';
  END IF;

  v_new_balance := round(v_current_balance + v_signed_amount, 2);

  -- Rule: Do not allow negative balance on debit
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Débito não permitido: o valor do ajuste (R$ %) é superior ao saldo disponível (R$ %).',
      round(abs(p_amount), 2), round(v_current_balance, 2);
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
        'old_balance', v_current_balance,
        'new_balance', v_current_balance
      );
    END IF;
  END IF;

  -- 7. Transactional Insert into driver_earnings (Same native wallet table!)
  INSERT INTO public.driver_earnings (
    driver_id,
    amount,
    status,
    delivery_request_id,
    description,
    adjustment_type,
    created_by_admin_id
  ) VALUES (
    p_driver_id,
    v_signed_amount,
    'pending',
    NULL, -- No delivery request linked!
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
    p_driver_id,
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
    'driver_id', p_driver_id,
    'driver_name', v_driver_name,
    'operation', p_operation,
    'signed_amount', v_signed_amount,
    'old_balance', v_current_balance,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_driver_wallet(uuid, text, numeric, text, text) TO authenticated;
