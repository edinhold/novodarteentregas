-- Create a private schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS private;

-- Move the functions to the private schema
ALTER FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) SET SCHEMA private;
ALTER FUNCTION public.redeem_credit_code(text) SET SCHEMA private;
ALTER FUNCTION public.complete_delivery(uuid) SET SCHEMA private;

-- Re-grant permissions in the new schema
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.redeem_credit_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.complete_delivery(uuid) TO authenticated, service_role;