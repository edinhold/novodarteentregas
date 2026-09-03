
-- 1) delivery_config: restrict full SELECT to admins, expose safe fields via view
DROP POLICY IF EXISTS "Authenticated users view config" ON public.delivery_config;
DROP POLICY IF EXISTS "Authenticated users view full config" ON public.delivery_config;
DROP POLICY IF EXISTS "Public can view non-sensitive config" ON public.delivery_config;

CREATE POLICY "Admins view full config"
  ON public.delivery_config
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Recreate public view WITHOUT app_fee_per_delivery (platform commission)
DROP VIEW IF EXISTS public.public_delivery_config;
CREATE VIEW public.public_delivery_config
WITH (security_invoker = false) AS
SELECT
  id,
  base_fee,
  fee_per_km,
  min_km,
  max_km,
  round_km_up,
  promo_credit_percent,
  payment_day,
  early_withdrawal_fee_percent,
  whatsapp_number,
  recharge_url,
  updated_at
FROM public.delivery_config;

GRANT SELECT ON public.public_delivery_config TO anon, authenticated;

-- Drop the unused duplicate view
DROP VIEW IF EXISTS public.delivery_config_public;

-- 2) delivery_requests UPDATE: tighten driver permissions
DROP POLICY IF EXISTS "Drivers can accept or update their requests" ON public.delivery_requests;

CREATE POLICY "Drivers can accept or update their requests"
  ON public.delivery_requests
  FOR UPDATE
  TO authenticated
  USING (
    -- Driver can claim an unassigned pending request
    (status = 'pending' AND driver_id IS NULL AND public.has_role(auth.uid(), 'driver'::app_role))
    -- Driver can act on a request they already own
    OR (driver_id = auth.uid())
    -- Admin can do anything
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    -- Accepting/working their own delivery
    (driver_id = auth.uid() AND status IN ('accepted','picked_up'))
    -- Releasing their own delivery back to pending pool (cancel)
    OR (driver_id IS NULL AND status = 'pending')
    -- Admin overrides
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 3) driver_locations SELECT: restrict to owner / admin / store owner with active delivery
DROP POLICY IF EXISTS "Authenticated users can view driver locations" ON public.driver_locations;

CREATE POLICY "Restricted view of driver locations"
  ON public.driver_locations
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_store_owner_of_driver(user_id)
  );
