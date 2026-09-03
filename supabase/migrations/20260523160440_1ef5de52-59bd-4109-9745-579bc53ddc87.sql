-- 1. Secure Storage Buckets
-- Set driver-photos to private and add RLS
UPDATE storage.buckets SET public = false WHERE id = 'driver-photos';

-- Remove old policies if they exist (using DO block to handle errors gracefully)
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Drivers can upload their own photos" ON storage.objects;
    DROP POLICY IF EXISTS "Public can view driver photos" ON storage.objects;
    DROP POLICY IF EXISTS "Admins can manage all driver photos" ON storage.objects;
    DROP POLICY IF EXISTS "Drivers can manage their own photos" ON storage.objects;
    DROP POLICY IF EXISTS "Admins can view all photos" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Drivers can manage their own photos"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'driver-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'driver-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can view all photos"
ON storage.objects FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- 2. Revoke public EXECUTE on sensitive functions
REVOKE EXECUTE ON FUNCTION public.redeem_credit_code(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric) FROM public;
REVOKE EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;

-- 3. Secure delivery_config
-- Create a view for public access
CREATE OR REPLACE VIEW public.public_delivery_config AS
SELECT 
    id,
    base_fee,
    fee_per_km,
    min_km,
    max_km,
    round_km_up,
    promo_credit_percent,
    app_fee_per_delivery,
    updated_at
FROM public.delivery_config;

-- Update RLS to prevent public access to sensitive columns in the main table
DROP POLICY IF EXISTS "Public can view non-sensitive config" ON public.delivery_config;
CREATE POLICY "Public can view non-sensitive config" 
ON public.delivery_config FOR SELECT 
TO public
USING (false); -- Force use of view or authenticated session

DROP POLICY IF EXISTS "Authenticated users view config" ON public.delivery_config;
CREATE POLICY "Authenticated users view config" 
ON public.delivery_config FOR SELECT 
TO authenticated
USING (true);

-- 4. Secure Withdrawal Requests
-- Create RPC for withdrawal
CREATE OR REPLACE FUNCTION public.request_withdrawal()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid;
    v_driver_id uuid;
    v_total_pending numeric;
    v_payment_day integer;
    v_early_fee_percent numeric;
    v_fee_amount numeric;
    v_net_amount numeric;
    v_pix_key text;
    v_pix_key_type text;
    v_today integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

    -- Get driver profile and PIX
    SELECT id, pix_key, pix_key_type INTO v_driver_id, v_pix_key, v_pix_key_type
    FROM public.drivers
    WHERE user_id = v_user_id;

    IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Perfil de entregador não encontrado'; END IF;
    IF v_pix_key IS NULL OR v_pix_key = '' THEN RAISE EXCEPTION 'Chave PIX não cadastrada'; END IF;

    -- Get pending balance
    SELECT COALESCE(SUM(amount), 0) INTO v_total_pending
    FROM public.driver_earnings
    WHERE driver_id = v_driver_id AND status = 'pending';

    IF v_total_pending <= 0 THEN RAISE EXCEPTION 'Sem saldo disponível para saque'; END IF;

    -- Get config
    SELECT 
        COALESCE(payment_day, 15), 
        COALESCE(early_withdrawal_fee_percent, 10)
    INTO v_payment_day, v_early_fee_percent
    FROM public.delivery_config
    LIMIT 1;

    v_today := extract(day from now());
    
    -- Calculate fees
    IF v_today = v_payment_day THEN
        v_early_fee_percent := 0;
    END IF;

    v_fee_amount := (v_total_pending * v_early_fee_percent) / 100;
    v_net_amount := v_total_pending - v_fee_amount;

    -- Insert request
    INSERT INTO public.withdrawal_requests (
        driver_id,
        driver_user_id,
        amount,
        fee_percent,
        fee_amount,
        net_amount,
        pix_key,
        pix_key_type
    ) VALUES (
        v_driver_id,
        v_user_id,
        v_total_pending,
        v_early_fee_percent,
        v_fee_amount,
        v_net_amount,
        v_pix_key,
        v_pix_key_type
    );

    -- Mark earnings as 'withdrawing'
    UPDATE public.driver_earnings
    SET status = 'requested'
    WHERE driver_id = v_driver_id AND status = 'pending';

    RETURN true;
END;
$$;

-- Revoke direct INSERT on withdrawal_requests
DROP POLICY IF EXISTS "Drivers can create withdrawals" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Drivers can view own withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Drivers can view own withdrawals" 
ON public.withdrawal_requests FOR SELECT 
TO authenticated
USING (driver_user_id = auth.uid());

-- 5. Secure Delivery Requests (Stop price tampering)
DROP POLICY IF EXISTS "Store owners can create requests" ON public.delivery_requests;

-- Ensure store owners can still view their requests
DROP POLICY IF EXISTS "Store owners can view own requests" ON public.delivery_requests;
CREATE POLICY "Store owners can view own requests" 
ON public.delivery_requests FOR SELECT 
TO authenticated
USING (auth.uid() = store_owner_id);
