
ALTER TABLE public.delivery_config
  ADD COLUMN IF NOT EXISTS withdrawal_fixed_fee numeric NOT NULL DEFAULT 1.00;

UPDATE public.delivery_config SET payment_day = 5 WHERE payment_day < 0 OR payment_day > 6;

DROP FUNCTION IF EXISTS public.get_public_delivery_config();

CREATE OR REPLACE FUNCTION public.get_public_delivery_config()
 RETURNS TABLE(id uuid, base_fee numeric, fee_per_km numeric, min_km numeric, max_km numeric, round_km_up boolean, promo_credit_percent numeric, payment_day integer, early_withdrawal_fee_percent numeric, withdrawal_fixed_fee numeric, whatsapp_number text, recharge_url text, updated_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id, base_fee, fee_per_km, min_km, max_km, round_km_up, promo_credit_percent,
         payment_day, early_withdrawal_fee_percent, withdrawal_fixed_fee,
         whatsapp_number, recharge_url, updated_at
  FROM public.delivery_config LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.request_withdrawal()
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_driver_id uuid;
    v_total_pending numeric;
    v_payment_day integer;
    v_fixed_fee numeric;
    v_fee_amount numeric;
    v_net_amount numeric;
    v_pix_key text;
    v_pix_key_type text;
    v_today_dow integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

    SELECT id, pix_key, pix_key_type INTO v_driver_id, v_pix_key, v_pix_key_type
    FROM public.drivers WHERE user_id = v_user_id;

    IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Perfil de entregador não encontrado'; END IF;
    IF v_pix_key IS NULL OR v_pix_key = '' THEN RAISE EXCEPTION 'Chave PIX não cadastrada'; END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_pending
    FROM public.driver_earnings
    WHERE driver_id = v_driver_id AND status = 'pending';

    IF v_total_pending <= 0 THEN RAISE EXCEPTION 'Sem saldo disponível para saque'; END IF;

    SELECT COALESCE(payment_day, 5), COALESCE(withdrawal_fixed_fee, 1.00)
    INTO v_payment_day, v_fixed_fee
    FROM public.delivery_config LIMIT 1;

    v_today_dow := extract(dow from now() AT TIME ZONE 'America/Cuiaba')::integer;

    IF v_today_dow <> v_payment_day THEN
        RAISE EXCEPTION 'Saques permitidos apenas no dia configurado da semana';
    END IF;

    v_fee_amount := v_fixed_fee;
    v_net_amount := GREATEST(v_total_pending - v_fee_amount, 0);

    INSERT INTO public.withdrawal_requests (
        driver_id, driver_user_id, amount, fee_percent, fee_amount, net_amount, pix_key, pix_key_type
    ) VALUES (
        v_driver_id, v_user_id, v_total_pending, 0, v_fee_amount, v_net_amount, v_pix_key, v_pix_key_type
    );

    UPDATE public.driver_earnings
    SET status = 'requested'
    WHERE driver_id = v_driver_id AND status = 'pending';

    RETURN true;
END;
$function$;
