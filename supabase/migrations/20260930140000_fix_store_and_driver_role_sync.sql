-- Migration: Guarantee user_roles synchronization for all stores and drivers
-- Date: 2026-09-30

-- 1. Ensure user_roles backfill for all restaurants
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT r.owner_id, 'store_owner'::app_role
FROM public.restaurants r
WHERE r.owner_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Ensure user_roles backfill for all drivers (covering user_id and id)
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT COALESCE(d.user_id, d.id), 'driver'::app_role
FROM public.drivers d
WHERE COALESCE(d.user_id, d.id) IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Ensure trigger on restaurants table catches updates and inserts
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

-- 4. Ensure trigger on drivers table catches updates and inserts
CREATE OR REPLACE FUNCTION public.sync_driver_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.user_id, NEW.id) IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (COALESCE(NEW.user_id, NEW.id), 'driver'::app_role)
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

NOTIFY pgrst, 'reload schema';
