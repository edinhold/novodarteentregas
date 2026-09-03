
-- Phase 2: Mandatory linking of recharges to a specific store owner (lojista)

-- 1) Add assignment column to credit_codes (nullable to preserve legacy codes)
ALTER TABLE public.credit_codes
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_credit_codes_assigned_to ON public.credit_codes(assigned_to_user_id);

-- 2) Redeem RPC enforces assignment when set
CREATE OR REPLACE FUNCTION public.redeem_credit_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id uuid;
  v_value numeric;
  v_assigned uuid;
  v_user_id uuid;
  v_promo numeric;
  v_total numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id, value, assigned_to_user_id
    INTO v_code_id, v_value, v_assigned
  FROM public.credit_codes
  WHERE code = p_code AND is_used = false
  FOR UPDATE;

  IF v_code_id IS NULL THEN
    RAISE EXCEPTION 'Código inválido ou já utilizado';
  END IF;

  IF v_assigned IS NOT NULL AND v_assigned <> v_user_id THEN
    RAISE EXCEPTION 'Este código de recarga é vinculado a outro lojista';
  END IF;

  SELECT COALESCE(promo_credit_percent, 0) INTO v_promo FROM public.delivery_config LIMIT 1;
  v_total := v_value + (v_value * COALESCE(v_promo, 0) / 100);

  UPDATE public.credit_codes
     SET is_used = true, used_by = v_user_id, used_at = now()
   WHERE id = v_code_id;

  INSERT INTO public.store_credits (user_id, balance)
  VALUES (v_user_id, v_total)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.store_credits.balance + v_total,
        updated_at = now();

  RETURN true;
END;
$$;

-- 3) Direct recharge by admin (no code needed)
CREATE OR REPLACE FUNCTION public.admin_recharge_store(p_store_owner_id uuid, p_amount numeric, p_apply_promo boolean DEFAULT false)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_promo numeric := 0;
  v_total numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem realizar recargas diretas';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor de recarga inválido';
  END IF;
  IF NOT public.has_role(p_store_owner_id, 'store_owner'::app_role) THEN
    RAISE EXCEPTION 'Usuário alvo não é um lojista válido';
  END IF;

  IF p_apply_promo THEN
    SELECT COALESCE(promo_credit_percent, 0) INTO v_promo FROM public.delivery_config LIMIT 1;
  END IF;

  v_total := p_amount + (p_amount * COALESCE(v_promo, 0) / 100);

  INSERT INTO public.store_credits (user_id, balance)
  VALUES (p_store_owner_id, v_total)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.store_credits.balance + v_total,
        updated_at = now();

  RETURN v_total;
END;
$$;

-- 4) Helper: list store owners for admin dropdown
CREATE OR REPLACE FUNCTION public.admin_list_store_owners()
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  RETURN QUERY
  SELECT ur.user_id,
         COALESCE(p.full_name, '') AS full_name,
         COALESCE(u.email, '') AS email
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'store_owner'::app_role
  ORDER BY COALESCE(p.full_name, u.email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_recharge_store(uuid, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_store_owners() TO authenticated;
