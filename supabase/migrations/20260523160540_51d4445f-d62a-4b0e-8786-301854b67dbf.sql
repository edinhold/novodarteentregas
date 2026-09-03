-- 1. Fix Security Definer View
DROP VIEW IF EXISTS public.assigned_driver_details;
CREATE VIEW public.assigned_driver_details WITH (security_invoker = true) AS
SELECT id,
    full_name,
    phone,
    photo_url,
    vehicle_type,
    vehicle_plate,
    is_active
FROM drivers
WHERE is_store_owner_of_driver(id);

-- 2. Revoke public EXECUTE on remaining helper functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public;
REVOKE EXECUTE ON FUNCTION public.is_store_owner_of_driver(uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_store_owner_of_driver(uuid) TO authenticated, service_role;
