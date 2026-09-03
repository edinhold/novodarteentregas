-- 1. Tighten Function Execution Privileges (Handling overloads)
DO $$ 
DECLARE 
    func_record record;
BEGIN
    FOR func_record IN 
        SELECT 
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public' AND p.prosecdef = true
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', 
                       func_record.function_name, func_record.args);
    END LOOP;
END $$;

-- Explicitly grant back to authenticated users for functions used by the app
GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_owner_of_driver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal() TO authenticated;

-- Handle deduct_credits_for_delivery overloads
DO $$ 
DECLARE 
    func_record record;
BEGIN
    FOR func_record IN 
        SELECT pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        WHERE p.proname = 'deduct_credits_for_delivery'
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(%s) TO authenticated', func_record.args);
    END LOOP;
END $$;

-- 2. Require Admin Approval for Drivers
ALTER TABLE public.drivers ALTER COLUMN is_active SET DEFAULT false;

-- 3. Hardening Storage Policies
-- Remove overly permissive policies
DROP POLICY IF EXISTS "Anyone can view specific driver photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view specific restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view driver photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view restaurant images" ON storage.objects;

-- Ensure only authenticated owners and admins can see driver photos
-- (Admins can view all photos was already added in previous migration)

-- Re-add restaurant image public access for storefront
CREATE POLICY "Public can view restaurant images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'restaurant-images');

-- 4. Final View Verification
DROP VIEW IF EXISTS public.assigned_driver_details;
CREATE VIEW public.assigned_driver_details WITH (security_invoker = true) AS
SELECT id, full_name, phone, photo_url, vehicle_type, vehicle_plate, is_active
FROM drivers
WHERE is_store_owner_of_driver(id);

DROP VIEW IF EXISTS public.public_delivery_config;
CREATE VIEW public.public_delivery_config WITH (security_invoker = true) AS
SELECT id, base_fee, fee_per_km, min_km, max_km, round_km_up, promo_credit_percent, app_fee_per_delivery, updated_at
FROM delivery_config;
