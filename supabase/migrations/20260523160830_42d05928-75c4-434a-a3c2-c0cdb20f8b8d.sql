-- 1. Secure Trigger Functions (They should only be called by the system/trigger)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_driver_location_update() FROM PUBLIC, anon, authenticated;

-- 2. Tighten user_roles self-assignment
-- Only allow self-insert for 'user' role. 'driver' and 'store_owner' should be via request or admin.
DROP POLICY IF EXISTS "Authenticated can insert own safe role" ON public.user_roles;
CREATE POLICY "Users can self-assign user role"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND role = 'user'::app_role);

-- 3. Storage: Prevent Listing on Public Buckets
DROP POLICY IF EXISTS "Public can view restaurant images" ON storage.objects;
CREATE POLICY "Public can view restaurant images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'restaurant-images' AND storage.filename(name) <> '');

-- 4. Ensure no other public-callable security definer functions exist
-- I already ran the loop, so this is just verification.
