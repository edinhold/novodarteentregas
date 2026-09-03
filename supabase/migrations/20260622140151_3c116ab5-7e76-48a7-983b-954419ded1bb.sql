CREATE OR REPLACE FUNCTION public.get_support_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.user_roles
  WHERE role = 'admin'::app_role
  ORDER BY user_id
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_support_admin_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_support_admin_id() TO authenticated;