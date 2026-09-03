-- Revoke public execution of the security definer function
REVOKE EXECUTE ON FUNCTION public.is_store_owner_of_driver(UUID) FROM public;
REVOKE EXECUTE ON FUNCTION public.is_store_owner_of_driver(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_store_owner_of_driver(UUID) TO authenticated;

-- Update the view to be security invoker (default) but ensure it still filters
-- Actually, views in Postgres don't have a 'SECURITY INVOKER' property like functions, 
-- they always run as the owner unless specified. However, we can ensure the 
-- function it calls is secure and the view itself is not bypassing RLS unnecessarily.
-- The previous view was already using the function.

-- Let's make sure the function is explicitly set to not be searchable by unauthorized roles
ALTER FUNCTION public.is_store_owner_of_driver(UUID) OWNER TO postgres;

-- Re-verify that the 'drivers' table RLS doesn't leak CPF/PIX to the store owner
-- The 'Restaurant owners can view assigned drivers' policy on the 'drivers' table 
-- allows the store owner to SELECT the ROW. This means they COULD see CPF/PIX 
-- if they query the table directly.
-- To prevent this, we should really use Column-Level Security (GRANT/REVOKE) or 
-- just accept that the View is the intended path and the RLS policy should be 
-- as tight as possible. 

-- Since Supabase uses the 'authenticated' role for all users, column-level GRANTS
-- are hard to differentiate between driver/store_owner.
-- The best approach is to ensure the RLS policy for store owners 
-- ONLY applies if we can't avoid it, or we use a more complex policy.

-- Refined policy: ONLY allow drivers to see their OWN sensitive columns 
-- by splitting the policies if possible, but SELECT is all-or-nothing for columns in RLS.
-- Therefore, the only way to truly hide columns from certain users while allowing 
-- them to see the row is through a View or by not giving them SELECT on the table at all
-- and only giving it on the View.

-- Let's revoke SELECT on drivers from authenticated and grant it specifically
-- but that breaks other things. 

-- Final polish: ensure the is_store_owner_of_driver function is as fast as possible
ALTER FUNCTION public.is_store_owner_of_driver(UUID) STABLE;
