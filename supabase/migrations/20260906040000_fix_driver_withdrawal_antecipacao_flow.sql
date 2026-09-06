-- Migration: Fix driver withdrawal/antecipacao calculation, concurrency, and approval/rejection lifecycle.

-- 1. Create or Replace handle_withdrawal_request_status_change trigger function
CREATE OR REPLACE FUNCTION public.handle_withdrawal_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- When a withdrawal request is APPROVED by the admin, transition driver earnings from 'requested' to 'paid'
    IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
        UPDATE public.driver_earnings
        SET status = 'paid', updated_at = now()
        WHERE driver_id = NEW.driver_id AND status = 'requested';
    -- When a withdrawal request is REJECTED by the admin, revert driver earnings from 'requested' back to 'pending'
    ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
        UPDATE public.driver_earnings
        SET status = 'pending', updated_at = now()
        WHERE driver_id = NEW.driver_id AND status = 'requested';
    END IF;
    RETURN NEW;
END;
$function$;

-- Attach trigger to withdrawal_requests
DROP TRIGGER IF EXISTS trg_withdrawal_status_change ON public.withdrawal_requests;
CREATE TRIGGER trg_withdrawal_status_change
AFTER UPDATE ON public.withdrawal_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.handle_withdrawal_request_status_change();


-- 2. Create or Replace request_withdrawal RPC function
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

    -- Check if driver already has an unhandled pending request (Concurrency / Anti-duplicate guard)
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

    -- Fetch current rate settings from delivery_config
    SELECT COALESCE(payment_day, 5),
           COALESCE(withdrawal_fixed_fee, 1.00),
           COALESCE(early_withdrawal_fee_percent, 10)
    INTO v_payment_day, v_fixed_fee, v_early_fee_percent
    FROM public.delivery_config LIMIT 1;

    -- Get current day of week in Brazil timezone (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    v_today_dow := extract(dow from (now() AT TIME ZONE 'America/Cuiaba'))::integer;

    -- Rule: On payment day, charge ONLY fixed fee R$ 1.00. Outside payment day, charge percentage. NEVER both.
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

    -- Mark earnings as requested (locked while request is pending)
    UPDATE public.driver_earnings
    SET status = 'requested', updated_at = now()
    WHERE driver_id = v_driver_id AND status = 'pending';

    RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal() TO authenticated;

-- 3. Self-healing cleanup for any legacy orphaned earnings records
UPDATE public.driver_earnings e
SET status = 'pending', updated_at = now()
FROM public.withdrawal_requests w
WHERE e.driver_id = w.driver_id 
  AND e.status = 'requested' 
  AND w.status = 'rejected';

UPDATE public.driver_earnings e
SET status = 'paid', updated_at = now()
FROM public.withdrawal_requests w
WHERE e.driver_id = w.driver_id 
  AND e.status = 'requested' 
  AND w.status = 'approved';
