-- 1. Fix: Withdrawal request validation
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'withdrawals') THEN
        -- Drop if exists to avoid conflicts
        ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS check_positive_amount;
        ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS check_valid_net_amount;
        
        ALTER TABLE public.withdrawals 
        ADD CONSTRAINT check_positive_amount CHECK (amount > 0),
        ADD CONSTRAINT check_valid_net_amount CHECK (net_amount = amount - (amount * fee_percent / 100));
    END IF;
END $$;

-- 2. Fix: Hide owner_id from anonymous users in restaurants
CREATE OR REPLACE VIEW public.restaurants_public AS
SELECT 
    id, name, address, latitude, longitude, 
    delivery_time, delivery_fee, min_order, 
    is_open, updated_at
FROM public.restaurants;

GRANT SELECT ON public.restaurants_public TO anon, authenticated;

-- Ensure RLS is on
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- Policy for owners/admins to see everything
DROP POLICY IF EXISTS "Owners can view their own restaurants" ON public.restaurants;
CREATE POLICY "Owners can view their own restaurants" 
ON public.restaurants 
FOR SELECT 
USING (auth.uid() = owner_id OR (SELECT (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))));

-- 3. Fix: Restrict sensitive config fields (whatsapp_number, recharge_url)
ALTER TABLE public.delivery_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Delivery config is viewable by everyone" ON public.delivery_config;

-- View for anonymous users (hiding sensitive fields)
CREATE OR REPLACE VIEW public.delivery_config_public AS
SELECT 
    id, base_fee, fee_per_km, min_km, max_km, round_km_up, updated_at
FROM public.delivery_config;

GRANT SELECT ON public.delivery_config_public TO anon, authenticated;

-- Only authenticated users see full details
CREATE POLICY "Authenticated users view full config" 
ON public.delivery_config 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- 4. Fix: Driver identity resolution for store owners
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers are viewable by everyone" ON public.drivers;
DROP POLICY IF EXISTS "Restaurant owners can view assigned drivers" ON public.drivers;

CREATE POLICY "Restaurant owners can view assigned drivers" 
ON public.drivers 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.delivery_requests dr
    JOIN public.restaurants r ON dr.restaurant_id = r.id
    WHERE dr.driver_id = public.drivers.id 
    AND r.owner_id = auth.uid()
  )
);

CREATE POLICY "Drivers can view their own profile" 
ON public.drivers 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all drivers" 
ON public.drivers 
FOR ALL 
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
