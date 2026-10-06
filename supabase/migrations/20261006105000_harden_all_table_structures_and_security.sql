-- Migration: Comprehensive Security Hardening & Integrity Protections
-- Date: 2026-10-06
-- Description:
-- 1. Protect drivers table: prevent drivers from changing user_id, driver_code, or id.
-- 2. Protect restaurants table: prevent store owners from changing owner_id or id.
-- 3. Protect profiles table: prevent users from changing user_id or id.
-- 4. Protect delivery_groups table: prevent non-admins from changing total_cost, store_owner_id, or restaurant_id on UPDATE, and restrict INSERT to store_owner or admin roles.
-- 5. Protect user_roles table: prevent non-admins from updating user_roles rows.

-- 1. ENHANCE DRIVERS TABLE SECURITY TRIGGER
CREATE OR REPLACE FUNCTION public.protect_driver_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If not an admin, enforce original values for approval_status, is_active, user_id, id, and driver_code
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.approval_status := OLD.approval_status;
    NEW.is_active := OLD.is_active;
    NEW.user_id := OLD.user_id;
    NEW.id := OLD.id;
    NEW.driver_code := OLD.driver_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_driver_admin_fields ON public.drivers;
CREATE TRIGGER trg_protect_driver_admin_fields
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_driver_admin_fields();


-- 2. PROTECT RESTAURANTS TABLE STRUCTURE AND OWNERSHIP
CREATE OR REPLACE FUNCTION public.protect_restaurant_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.owner_id := OLD.owner_id;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_restaurant_admin_fields ON public.restaurants;
CREATE TRIGGER trg_protect_restaurant_admin_fields
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_restaurant_admin_fields();


-- 3. PROTECT PROFILES USER_ID INTEGRITY
CREATE OR REPLACE FUNCTION public.protect_profiles_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.user_id := OLD.user_id;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profiles_user_id ON public.profiles;
CREATE TRIGGER trg_protect_profiles_user_id
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_user_id();


-- 4. PROTECT DELIVERY_GROUPS SENSITIVE FINANCIAL AND STRUCTURAL FIELDS
CREATE OR REPLACE FUNCTION public.protect_delivery_group_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.total_cost := OLD.total_cost;
    NEW.store_owner_id := OLD.store_owner_id;
    NEW.restaurant_id := OLD.restaurant_id;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_delivery_group_financial_fields ON public.delivery_groups;
CREATE TRIGGER trg_protect_delivery_group_financial_fields
  BEFORE UPDATE ON public.delivery_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_delivery_group_financial_fields();

-- Tighten INSERT RLS Policy on delivery_groups
DROP POLICY IF EXISTS "Store owners can insert their own groups" ON public.delivery_groups;
CREATE POLICY "Store owners can insert their own groups"
  ON public.delivery_groups FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = store_owner_id
    AND (
      public.has_role(auth.uid(), 'store_owner'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );


-- 5. PREVENT NON-ADMINS FROM UPDATING user_roles
CREATE OR REPLACE FUNCTION public.protect_user_roles_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem atualizar papeis de usuario diretamente.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_roles_update ON public.user_roles;
CREATE TRIGGER trg_protect_user_roles_update
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_roles_update();

-- RELOAD SCHEMA
NOTIFY pgrst, 'reload schema';
