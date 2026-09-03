
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending';

-- Backfill existing drivers as approved so nobody perde acesso
UPDATE public.drivers SET approval_status = 'approved' WHERE approval_status = 'pending';

-- Change default so new signups start as pending
ALTER TABLE public.drivers ALTER COLUMN approval_status SET DEFAULT 'pending';

-- Update radar function to only return approved drivers
CREATE OR REPLACE FUNCTION public.get_radar_drivers()
 RETURNS TABLE(id uuid, user_id uuid, full_name text, driver_code text, vehicle_plate text, vehicle_type text, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.user_id, d.full_name, d.driver_code, d.vehicle_plate, d.vehicle_type, d.is_active
  FROM public.drivers d
  WHERE d.is_active = true
    AND d.approval_status = 'approved'
    AND (
      public.has_role(auth.uid(), 'store_owner'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    );
$function$;
