-- Set search path for security
ALTER FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) SET search_path = public;

-- Revoke all permissions and only grant to authenticated users
REVOKE ALL ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) TO authenticated;
