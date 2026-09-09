-- Migration: Configure driver payout day (default Wednesday = 3), withdrawal fixed maintenance fee (default R$ 1.00), and percentage fee for early withdrawals.

-- 1. Ensure columns exist with correct defaults in delivery_config
ALTER TABLE public.delivery_config 
  ADD COLUMN IF NOT EXISTS payment_day integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS withdrawal_fixed_fee numeric DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS early_withdrawal_fee_percent numeric DEFAULT 10;

-- Update existing delivery_config row if values are null or payment_day is legacy 5
UPDATE public.delivery_config
SET 
  payment_day = COALESCE(payment_day, 3),
  withdrawal_fixed_fee = COALESCE(withdrawal_fixed_fee, 1.00),
  early_withdrawal_fee_percent = COALESCE(early_withdrawal_fee_percent, 10);

-- 2. Update request_withdrawal RPC function
CREATE OR REPLACE FUNCTION public.request_withdrawal()
RETURNS boolean
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
        RAISE EXCEPTION 'Perfil de entregador não encontrado.'; 
    END IF;

    IF v_pix_key IS NULL OR trim(v_pix_key) = '' THEN 
        RAISE EXCEPTION 'Por favor, cadastre sua chave PIX antes de solicitar o saque.'; 
    END IF;

    -- Check if driver already has an unhandled pending request
    IF EXISTS (
        SELECT 1 FROM public.withdrawal_requests 
        WHERE driver_id = v_driver_id AND status = 'pending'
    ) THEN
        RAISE EXCEPTION 'Você já possui uma solicitação de antecipação pendente. Aguarde o processamento do administrador.';
    END IF;

    -- Calculate available pending earnings balance
    SELECT COALESCE(SUM(amount), 0) INTO v_total_pending
    FROM public.driver_earnings
    WHERE driver_id = v_driver_id AND status = 'pending';

    IF v_total_pending <= 0 THEN 
        RAISE EXCEPTION 'Sem saldo disponível para saque no momento.'; 
    END IF;

    -- Fetch current rate settings from delivery_config (default payment_day = 3 [Quarta-feira], fixed_fee = 1.00)
    SELECT COALESCE(payment_day, 3),
           COALESCE(withdrawal_fixed_fee, 1.00),
           COALESCE(early_withdrawal_fee_percent, 10)
    INTO v_payment_day, v_fixed_fee, v_early_fee_percent
    FROM public.delivery_config LIMIT 1;

    IF v_payment_day IS NULL THEN v_payment_day := 3; END IF;
    IF v_fixed_fee IS NULL THEN v_fixed_fee := 1.00; END IF;
    IF v_early_fee_percent IS NULL THEN v_early_fee_percent := 10; END IF;

    -- Get current day of week in Brazil timezone (0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, ..., 6 = Saturday)
    v_today_dow := extract(dow from (now() AT TIME ZONE 'America/Cuiaba'))::integer;

    -- Rule: On official payment day (e.g. Wednesday), charge ONLY fixed maintenance fee (R$ 1.00). Outside payment day, charge percentage.
    IF v_today_dow = v_payment_day THEN
        v_fee_percent := 0;
        v_fee_amount := COALESCE(v_fixed_fee, 1.00);
    ELSE
        v_fee_percent := COALESCE(v_early_fee_percent, 10);
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
        status
    ) VALUES (
        v_driver_id, 
        v_user_id, 
        v_total_pending, 
        v_fee_percent, 
        v_fee_amount, 
        v_net_amount, 
        v_pix_key, 
        v_pix_key_type,
        'pending'
    );

    -- Mark earnings as requested
    UPDATE public.driver_earnings
    SET status = 'requested', updated_at = now()
    WHERE driver_id = v_driver_id AND status = 'pending';

    RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal() TO authenticated;
