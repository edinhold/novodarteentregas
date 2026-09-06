-- Migration to backfill and guarantee user_roles for all drivers and store owners

-- 1. Update user_roles insert policy to allow authenticated users to insert own roles
DROP POLICY IF EXISTS "Users can self-assign user role" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated can insert own safe role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;

CREATE POLICY "Users can insert own roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. Backfill user_roles for all existing drivers
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT d.user_id, 'driver'::app_role
FROM public.drivers d
WHERE d.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = d.user_id AND ur.role = 'driver'::app_role
  )
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Backfill user_roles for all existing store owners
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT r.owner_id, 'store_owner'::app_role
FROM public.restaurants r
WHERE r.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = r.owner_id AND ur.role = 'store_owner'::app_role
  )
ON CONFLICT (user_id, role) DO NOTHING;

-- 4. Automatic trigger to maintain user_roles on drivers table
CREATE OR REPLACE FUNCTION public.sync_driver_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'driver'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_driver_user_role ON public.drivers;
CREATE TRIGGER trg_sync_driver_user_role
  AFTER INSERT OR UPDATE OF user_id ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_driver_user_role();

-- 5. Automatic trigger to maintain user_roles on restaurants table
CREATE OR REPLACE FUNCTION public.sync_store_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.owner_id, 'store_owner'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_store_user_role ON public.restaurants;
CREATE TRIGGER trg_sync_store_user_role
  AFTER INSERT OR UPDATE OF owner_id ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_store_user_role();
