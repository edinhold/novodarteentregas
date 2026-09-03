-- Remove public/anonymous execution from support helper functions, then explicitly allow logged-in users
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

REVOKE ALL ON FUNCTION public.get_support_admin_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_support_admin_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_support_admin_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_admin_id() TO service_role;