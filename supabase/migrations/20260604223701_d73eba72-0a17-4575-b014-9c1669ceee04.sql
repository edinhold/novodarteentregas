-- Move the functions back to the public schema
ALTER FUNCTION private.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) SET SCHEMA public;
ALTER FUNCTION private.redeem_credit_code(text) SET SCHEMA public;
ALTER FUNCTION private.complete_delivery(uuid) SET SCHEMA public;

-- Ensure execute permissions are correctly set (they should persist, but being explicit is safer)
REVOKE EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.redeem_credit_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated, service_role;

-- Drop the private schema if it's no longer used for these
DROP SCHEMA IF EXISTS private CASCADE;