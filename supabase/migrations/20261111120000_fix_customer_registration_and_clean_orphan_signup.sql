-- Migration: Fix Customer Registration, Auto-Confirm, and Clean Orphan Signups
-- Date: 2026-11-11
-- Description:
-- 1. Auto-confirm any new user created in auth.users via BEFORE INSERT trigger so customers are never trapped in unconfirmed limbo.
-- 2. Retroactively auto-confirm any existing unconfirmed users in auth.users.
-- 3. Harden handle_new_user() trigger with ON CONFLICT and EXCEPTION block so profile creation can never fail/abort auth signup.
-- 4. Create public.clean_orphan_signup(p_email, p_phone) RPC with SECURITY DEFINER to safely clean orphan/unconfirmed signups and free up email.
-- 5. Create public.confirm_user_email(p_email) RPC with SECURITY DEFINER to allow instant confirmation when logging in.

-- 1. AUTO-CONFIRM TRIGGER FOR AUTH.USERS
CREATE OR REPLACE FUNCTION public.handle_new_user_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  IF NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_confirm ON auth.users;
CREATE TRIGGER on_auth_user_created_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_confirmation();

-- 2. RETROACTIVELY CONFIRM EXISTING UNCONFIRMED USERS
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
    confirmed_at = COALESCE(confirmed_at, now())
WHERE email_confirmed_at IS NULL;

-- 3. HARDEN HANDLE_NEW_USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture', '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = CASE 
        WHEN EXCLUDED.full_name IS NOT NULL AND EXCLUDED.full_name <> '' THEN EXCLUDED.full_name 
        ELSE public.profiles.full_name 
      END,
      avatar_url = CASE 
        WHEN EXCLUDED.avatar_url IS NOT NULL AND EXCLUDED.avatar_url <> '' THEN EXCLUDED.avatar_url 
        ELSE public.profiles.avatar_url 
      END,
      updated_at = now();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Prevent any error in profile handling from crashing auth.users signup
  RETURN NEW;
END;
$$;

-- 4. CLEAN ORPHAN SIGNUP RPC
CREATE OR REPLACE FUNCTION public.clean_orphan_signup(
  p_email TEXT,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_user_id UUID;
  v_has_privileged_role BOOLEAN := false;
  v_has_restaurant BOOLEAN := false;
  v_has_driver BOOLEAN := false;
  v_has_orders BOOLEAN := false;
  v_has_deliveries BOOLEAN := false;
  v_is_active BOOLEAN := false;
BEGIN
  IF v_email = '' AND v_phone = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'cleaned', false,
      'active', false,
      'message', 'E-mail ou telefone obrigatório.'
    );
  END IF;

  -- Find the user in auth.users
  SELECT u.id
  INTO v_user_id
  FROM auth.users u
  WHERE (v_email <> '' AND lower(u.email) = v_email)
     OR (v_phone <> '' AND u.phone IS NOT NULL AND regexp_replace(u.phone, '\D', '', 'g') = v_phone)
  ORDER BY u.created_at DESC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'cleaned', false,
      'active', false,
      'message', 'Nenhum usuário encontrado.'
    );
  END IF;

  -- Check if user has admin, store_owner, or driver role
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id
      AND role IN ('admin', 'store_owner', 'driver')
  ) INTO v_has_privileged_role;

  -- Check if user owns a restaurant
  SELECT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE owner_id = v_user_id
  ) INTO v_has_restaurant;

  -- Check if user is a driver
  SELECT EXISTS (
    SELECT 1 FROM public.drivers
    WHERE user_id = v_user_id
  ) INTO v_has_driver;

  -- Check if user has orders
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE user_id = v_user_id
  ) INTO v_has_orders;

  -- Check if user has deliveries
  SELECT EXISTS (
    SELECT 1 FROM public.delivery_requests
    WHERE store_owner_id = v_user_id OR driver_id = v_user_id
  ) INTO v_has_deliveries;

  v_is_active := v_has_privileged_role OR v_has_restaurant OR v_has_driver OR v_has_orders OR v_has_deliveries;

  IF v_is_active THEN
    RETURN jsonb_build_object(
      'success', true,
      'cleaned', false,
      'active', true,
      'message', 'Usuário com cadastro ativo no sistema.'
    );
  END IF;

  -- User is an orphan or incomplete signup. Safely clean up to free email for fresh registration.
  DELETE FROM public.chat_messages WHERE sender_id = v_user_id;
  DELETE FROM public.push_subscriptions WHERE user_id = v_user_id;
  DELETE FROM public.driver_push_devices WHERE driver_id = v_user_id OR external_id = v_user_id;
  DELETE FROM public.store_driver_favorites WHERE driver_id = v_user_id;
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE user_id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'cleaned', true,
    'active', false,
    'message', 'Registro órfão limpo com sucesso para novo cadastro.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'cleaned', false,
    'active', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clean_orphan_signup(TEXT, TEXT) TO anon, authenticated, service_role;

-- 5. CONFIRM USER EMAIL RPC
CREATE OR REPLACE FUNCTION public.confirm_user_email(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_updated INT := 0;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'E-mail inválido.');
  END IF;

  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
      confirmed_at = COALESCE(confirmed_at, now()),
      updated_at = now()
  WHERE lower(email) = v_email;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'confirmed', v_updated > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_user_email(TEXT) TO anon, authenticated, service_role;

