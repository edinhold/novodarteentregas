
DROP VIEW IF EXISTS public.public_delivery_config;

CREATE OR REPLACE FUNCTION public.get_public_delivery_config()
RETURNS TABLE (
  id uuid,
  base_fee numeric,
  fee_per_km numeric,
  min_km numeric,
  max_km numeric,
  round_km_up boolean,
  promo_credit_percent numeric,
  payment_day integer,
  early_withdrawal_fee_percent numeric,
  whatsapp_number text,
  recharge_url text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    whatsapp_number,
    recharge_url,
    updated_at
  FROM public.delivery_config
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_delivery_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_delivery_config() TO anon, authenticated;
