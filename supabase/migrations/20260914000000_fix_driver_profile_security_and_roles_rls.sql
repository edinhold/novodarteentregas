-- Migration: Fix Driver Profile & User Roles RLS Security Vulnerabilities
-- Date: 2026-09-14

-- 1. TIGHTEN user_roles INSERT POLICY
-- Prevent non-admin users from self-assigning the 'admin' role via direct Supabase REST requests.
DROP POLICY IF EXISTS "Users can self-assign user role" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated can insert own safe role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own safe roles" ON public.user_roles;

CREATE POLICY "Users can insert own safe roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id 
    AND role IN ('user'::app_role, 'driver'::app_role, 'store_owner'::app_role)
    AND role <> 'admin'::app_role
  );

-- 2. TRIGGER TO PROTECT ADMINISTRATIVE FIELDS ON DRIVERS TABLE
-- Prevents drivers from self-approving or self-activating their accounts via direct frontend updates.
CREATE OR REPLACE FUNCTION public.protect_driver_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If not an admin, enforce original values for approval_status and is_active
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.approval_status := OLD.approval_status;
    NEW.is_active := OLD.is_active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_driver_admin_fields ON public.drivers;
CREATE TRIGGER trg_protect_driver_admin_fields
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_driver_admin_fields();

-- 3. REINFORCE accept_delivery_request RPC SECURITY
CREATE OR REPLACE FUNCTION public.accept_delivery_request(
  p_request_id uuid DEFAULT NULL,
  p_pedido_id uuid DEFAULT NULL,
  p_motorista_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_req_id uuid := COALESCE(p_request_id, p_pedido_id);
  v_req RECORD;
BEGIN
  v_user := COALESCE(auth.uid(), p_motorista_id);

  IF v_req_id IS NULL THEN
    RAISE EXCEPTION 'ID da entrega não informado';
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Ensure target user has driver role unconditionally
  IF NOT public.has_role(v_user, 'driver'::app_role) THEN
    RAISE EXCEPTION 'Apenas motoristas podem aceitar entregas';
  END IF;

  -- Lock row to prevent race conditions
  SELECT id, status, driver_id, driver_fee, group_id
    INTO v_req
    FROM public.delivery_requests
    WHERE id = v_req_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta corrida já foi assumida por outro motorista';
  END IF;

  IF v_req.driver_id IS NOT NULL AND v_req.driver_id <> v_user THEN
    RAISE EXCEPTION 'Esta corrida foi direcionada a outro motorista';
  END IF;

  UPDATE public.delivery_requests
     SET driver_id = v_user,
         status = 'accepted',
         accepted_at = COALESCE(accepted_at, now()),
         updated_at = now()
   WHERE id = v_req_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta corrida já foi assumida por outro motorista';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'accepted', true,
    'request_id', v_req_id,
    'driver_fee', v_req.driver_fee,
    'status', 'accepted'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_delivery_request(uuid, uuid, uuid) TO authenticated, service_role, anon;

-- 4. REFRESH PostgREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
