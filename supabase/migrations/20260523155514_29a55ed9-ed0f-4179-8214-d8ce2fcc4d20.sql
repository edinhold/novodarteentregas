-- 1. Fix search_path for validate_order_prices
ALTER FUNCTION public.validate_order_prices() SET search_path = public;

-- 2. Revoke public EXECUTE from SECURITY DEFINER functions and grant only to necessary roles
-- This prevents anonymous users from calling these powerful functions directly via RPC

-- redeem_credit_code
REVOKE EXECUTE ON FUNCTION public.redeem_credit_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO authenticated;

-- deduct_credits_for_delivery (handle both overloads if they exist)
REVOKE EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric) TO authenticated;

-- complete_delivery
REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;

-- is_store_owner_of_driver
REVOKE EXECUTE ON FUNCTION public.is_store_owner_of_driver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_owner_of_driver(uuid) TO authenticated;

-- has_role
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- Trigger functions should NOT be executable by users at all
REVOKE EXECUTE ON FUNCTION public.validate_order_prices() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. Ensure all views have security_invoker = true (re-applying to be sure)
ALTER VIEW public.store_config SET (security_invoker = true);
ALTER VIEW public.restaurants_public SET (security_invoker = true);
ALTER VIEW public.delivery_config_public SET (security_invoker = true);
ALTER VIEW public.assigned_driver_details SET (security_invoker = true);
