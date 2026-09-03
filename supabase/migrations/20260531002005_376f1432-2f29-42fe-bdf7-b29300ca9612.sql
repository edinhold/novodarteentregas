-- Revoke execute from public/anon to ensure only authenticated users can call it
REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;
