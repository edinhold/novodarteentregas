-- 1. Fix remaining SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.request_withdrawal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal() TO authenticated;

REVOKE ALL ON FUNCTION public.place_order(uuid, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, text) TO authenticated;

-- 2. Convert all views to security_invoker
DROP VIEW IF EXISTS public.store_config;
CREATE VIEW public.store_config WITH (security_invoker = true) AS
SELECT id, base_fee, fee_per_km, min_km, max_km, round_km_up, updated_at
FROM delivery_config;

DROP VIEW IF EXISTS public.delivery_config_public;
CREATE VIEW public.delivery_config_public WITH (security_invoker = true) AS
SELECT id, base_fee, fee_per_km, min_km, max_km, round_km_up, updated_at
FROM delivery_config;

DROP VIEW IF EXISTS public.restaurants_public;
CREATE VIEW public.restaurants_public WITH (security_invoker = true) AS
SELECT id, name, address, latitude, longitude, delivery_time, delivery_fee, min_order, is_open, updated_at
FROM restaurants;

DROP VIEW IF EXISTS public.public_delivery_config;
CREATE VIEW public.public_delivery_config WITH (security_invoker = true) AS
SELECT id, base_fee, fee_per_km, min_km, max_km, round_km_up, promo_credit_percent, app_fee_per_delivery, updated_at
FROM delivery_config;
