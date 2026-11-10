-- Migration: Fix App Fee Configuration Persistence and RPC Synchronisation
-- Resolves issue where "Taxa do app por corrida (%)" reverts to unconfigured values or fails to persist in admin panel

-- 1. Ensure app_fee_per_delivery column exists in delivery_config with proper default
ALTER TABLE public.delivery_config
  ADD COLUMN IF NOT EXISTS app_fee_per_delivery numeric NOT NULL DEFAULT 2;

-- 2. Ensure permissions on delivery_config
GRANT SELECT, UPDATE, INSERT ON public.delivery_config TO authenticated;
GRANT SELECT ON public.delivery_config TO anon;
GRANT ALL ON public.delivery_config TO service_role;

-- 3. Dedicated SECURITY DEFINER RPC to retrieve full delivery config for admin panel
CREATE OR REPLACE FUNCTION public.get_admin_delivery_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean;
  v_cfg record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    SELECT public.has_role(v_caller_id, 'admin'::app_role) INTO v_is_admin;
  END IF;

  SELECT * INTO v_cfg FROM public.delivery_config LIMIT 1;
  IF v_cfg IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_cfg);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_delivery_config() TO authenticated, service_role;

-- 4. Dedicated SECURITY DEFINER RPC to update delivery config reliably
CREATE OR REPLACE FUNCTION public.update_delivery_config(
  p_base_fee numeric,
  p_fee_per_km numeric,
  p_min_km numeric,
  p_max_km numeric,
  p_round_km_up boolean,
  p_dynamic_pricing_enabled boolean,
  p_dynamic_fee_per_km numeric,
  p_early_withdrawal_fee_percent numeric DEFAULT 10,
  p_withdrawal_fixed_fee numeric DEFAULT 1.00,
  p_payment_day integer DEFAULT 3,
  p_app_fee_per_delivery numeric DEFAULT 2,
  p_whatsapp_number text DEFAULT '',
  p_recharge_url text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean;
  v_updated record;
  v_existing_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT public.has_role(v_caller_id, 'admin'::app_role) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar as taxas';
  END IF;

  SELECT id INTO v_existing_id FROM public.delivery_config LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.delivery_config
    SET
      base_fee = COALESCE(p_base_fee, 5.3),
      fee_per_km = COALESCE(p_fee_per_km, 1.7),
      min_km = COALESCE(p_min_km, 0),
      max_km = COALESCE(p_max_km, 0),
      round_km_up = COALESCE(p_round_km_up, false),
      dynamic_pricing_enabled = COALESCE(p_dynamic_pricing_enabled, false),
      dynamic_fee_per_km = COALESCE(p_dynamic_fee_per_km, 0),
      early_withdrawal_fee_percent = COALESCE(p_early_withdrawal_fee_percent, 10),
      withdrawal_fixed_fee = COALESCE(p_withdrawal_fixed_fee, 1.00),
      payment_day = COALESCE(p_payment_day, 3),
      app_fee_per_delivery = COALESCE(p_app_fee_per_delivery, 2),
      whatsapp_number = COALESCE(p_whatsapp_number, ''),
      recharge_url = COALESCE(p_recharge_url, ''),
      updated_at = now()
    WHERE id = v_existing_id
    RETURNING * INTO v_updated;
  ELSE
    INSERT INTO public.delivery_config (
      base_fee, fee_per_km, min_km, max_km, round_km_up,
      dynamic_pricing_enabled, dynamic_fee_per_km,
      early_withdrawal_fee_percent, withdrawal_fixed_fee, payment_day, app_fee_per_delivery,
      whatsapp_number, recharge_url, updated_at
    )
    VALUES (
      COALESCE(p_base_fee, 5.3), COALESCE(p_fee_per_km, 1.7), COALESCE(p_min_km, 0), COALESCE(p_max_km, 0), COALESCE(p_round_km_up, false),
      COALESCE(p_dynamic_pricing_enabled, false), COALESCE(p_dynamic_fee_per_km, 0),
      COALESCE(p_early_withdrawal_fee_percent, 10), COALESCE(p_withdrawal_fixed_fee, 1.00), COALESCE(p_payment_day, 3), COALESCE(p_app_fee_per_delivery, 2),
      COALESCE(p_whatsapp_number, ''), COALESCE(p_recharge_url, ''), now()
    )
    RETURNING * INTO v_updated;
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_delivery_config TO authenticated;

-- 5. Drop previous signature and recreate get_public_delivery_config with app_fee_per_delivery
DROP FUNCTION IF EXISTS public.get_public_delivery_config() CASCADE;

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
    COALESCE(app_fee_per_delivery, 2) AS app_fee_per_delivery,
    dynamic_pricing_enabled,
    dynamic_fee_per_km,
    whatsapp_number, 
    recharge_url, 
    updated_at
  FROM public.delivery_config 
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_delivery_config() TO anon, authenticated, service_role;

