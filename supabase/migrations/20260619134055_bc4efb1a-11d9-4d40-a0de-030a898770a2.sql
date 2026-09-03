
CREATE OR REPLACE FUNCTION public.request_withdrawal()
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

    SELECT id, pix_key, pix_key_type INTO v_driver_id, v_pix_key, v_pix_key_type
    FROM public.drivers WHERE user_id = v_user_id;

    IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Perfil de entregador não encontrado'; END IF;
    IF v_pix_key IS NULL OR v_pix_key = '' THEN RAISE EXCEPTION 'Chave PIX não cadastrada'; END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_pending
    FROM public.driver_earnings
    WHERE driver_id = v_driver_id AND status = 'pending';

    IF v_total_pending <= 0 THEN RAISE EXCEPTION 'Sem saldo disponível para saque'; END IF;

    SELECT COALESCE(payment_day, 5),
           COALESCE(withdrawal_fixed_fee, 1.00),
           COALESCE(early_withdrawal_fee_percent, 10)
    INTO v_payment_day, v_fixed_fee, v_early_fee_percent
    FROM public.delivery_config LIMIT 1;

    v_today_dow := extract(dow from now() AT TIME ZONE 'America/Cuiaba')::integer;

    IF v_today_dow = v_payment_day THEN
        v_fee_percent := 0;
        v_fee_amount := v_fixed_fee;
    ELSE
        v_fee_percent := v_early_fee_percent;
        v_fee_amount := (v_total_pending * v_early_fee_percent) / 100;
    END IF;

    v_net_amount := GREATEST(v_total_pending - v_fee_amount, 0);

    INSERT INTO public.withdrawal_requests (
        driver_id, driver_user_id, amount, fee_percent, fee_amount, net_amount, pix_key, pix_key_type
    ) VALUES (
        v_driver_id, v_user_id, v_total_pending, v_fee_percent, v_fee_amount, v_net_amount, v_pix_key, v_pix_key_type
    );

    UPDATE public.driver_earnings
    SET status = 'requested'
    WHERE driver_id = v_driver_id AND status = 'pending';

    RETURN true;
END;
$function$;
