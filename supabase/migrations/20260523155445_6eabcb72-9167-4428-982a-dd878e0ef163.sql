-- Recreate store_config with security_invoker
CREATE OR REPLACE VIEW public.store_config 
WITH (security_invoker = true)
AS
SELECT id,
    base_fee,
    fee_per_km,
    min_km,
    max_km,
    round_km_up,
    updated_at
FROM public.delivery_config;

-- Recreate restaurants_public with security_invoker
CREATE OR REPLACE VIEW public.restaurants_public
WITH (security_invoker = true)
AS
SELECT id,
    name,
    address,
    latitude,
    longitude,
    delivery_time,
    delivery_fee,
    min_order,
    is_open,
    updated_at
FROM public.restaurants;

-- Recreate delivery_config_public with security_invoker
CREATE OR REPLACE VIEW public.delivery_config_public
WITH (security_invoker = true)
AS
SELECT id,
    base_fee,
    fee_per_km,
    min_km,
    max_km,
    round_km_up,
    updated_at
FROM public.delivery_config;

-- Recreate assigned_driver_details with security_invoker
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
