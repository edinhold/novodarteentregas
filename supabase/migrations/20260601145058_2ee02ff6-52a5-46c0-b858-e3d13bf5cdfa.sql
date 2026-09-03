-- Revoke execution permissions from public/anon for sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) FROM public, anon;

-- Explicitly grant to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) TO authenticated, service_role;

-- handle_new_user should typically only be called by triggers (service_role)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
