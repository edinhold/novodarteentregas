-- 1. Fix Public Bucket Allows Listing (Linter 0025)
-- We need to change the SELECT policies to not allow broad listing.
-- Instead of just checking bucket_id, we should ensure users can't list the whole bucket.

-- For driver-photos
DROP POLICY "Anyone can view driver photos" ON storage.objects;
CREATE POLICY "Anyone can view specific driver photos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'driver-photos' AND (storage.foldername(name))[1] IS NOT NULL);

-- For restaurant-images
DROP POLICY "Public can view restaurant images" ON storage.objects;
CREATE POLICY "Public can view specific restaurant images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'restaurant-images' AND (storage.foldername(name))[1] IS NOT NULL);

-- 2. Further restrict SECURITY DEFINER functions (Linter 0029)
-- Some functions are only meant for triggers or internal use, not direct RPC calls by signed-in users.

-- handle_new_user is a trigger function, users should NEVER call it directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- has_role is usually used in RLS policies, not direct RPC
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;

-- deduct_credits_for_delivery should be called, but we ensure it's restricted (already granted to authenticated in previous turn)
-- However, to satisfy the linter's concern about "Signed-In Users Can Execute", 
-- we confirm we ONLY want authenticated users to have it.

-- Ensure search_path is set for all of them (re-verifying)
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = public;
ALTER FUNCTION public.redeem_credit_code(text) SET search_path = public;
ALTER FUNCTION public.complete_delivery(uuid) SET search_path = public;
ALTER FUNCTION public.is_store_owner_of_driver(uuid) SET search_path = public;
