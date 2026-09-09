-- Migration: Strict Driver Payout & Delivery Config RPC and Grant Updates

-- 1. Ensure RLS on delivery_config permits SELECT for authenticated users
GRANT SELECT ON public.delivery_config TO authenticated, anon;

-- 2. Update get_public_delivery_config RPC to return ALL columns dynamically
DROP FUNCTION IF EXISTS public.get_public_delivery_config();

CREATE OR REPLACE FUNCTION public.get_public_delivery_config()
RETURNS TABLE(
  id uuid, 
  base_fee numeric, 
  fee_per_km numeric, 
  min_km numeric, 
  max_km numeric, 
  round_km_up boolean, 
  promo_credit_percent numeric, 
  payment_day integer, 
  early_withdrawal_fee_percent numeric, 
  withdrawal_fixed_fee numeric, 
  app_fee_per_delivery numeric,
  dynamic_pricing_enabled boolean,
  dynamic_fee_per_km numeric,
  whatsapp_number text, 
  recharge_url text, 
  updated_at timestamp with time zone
)
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path TO 'public'
AS $function$
  SELECT 
    id, 
    base_fee, 
    fee_per_km, 
    min_km, 
    max_km, 
    round_km_up, 
    promo_credit_percent,
    payment_day, 
    early_withdrawal_fee_percent, 
    withdrawal_fixed_fee,
    app_fee_per_delivery,
    dynamic_pricing_enabled,
    dynamic_fee_per_km,
    whatsapp_number, 
    recharge_url, 
    updated_at
  FROM public.delivery_config 
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_delivery_config() TO anon, authenticated, service_role;

-- 3. Recreate request_withdrawal RPC with strict dynamic execution
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

GRANT EXECUTE ON FUNCTION public.request_withdrawal() TO authenticated, service_role;
