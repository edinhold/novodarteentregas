-- Update the function to only allow access for active/ongoing deliveries
CREATE OR REPLACE FUNCTION public.is_store_owner_of_driver(driver_id_to_check uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.delivery_requests dr
    JOIN public.restaurants r ON dr.restaurant_id = r.id
    WHERE dr.driver_id = driver_id_to_check
      AND r.owner_id = auth.uid()
      AND dr.status NOT IN ('completed', 'cancelled') -- Only allow access for active orders
  );
END;
$function$;

-- Ensure the view is using security_invoker to apply RLS correctly
CREATE OR REPLACE VIEW public.assigned_driver_details
WITH (security_invoker = true)
AS
SELECT id,
    full_name,
    phone,
    photo_url,
    vehicle_type,
    vehicle_plate,
    is_active
FROM public.drivers
WHERE is_store_owner_of_driver(id);
