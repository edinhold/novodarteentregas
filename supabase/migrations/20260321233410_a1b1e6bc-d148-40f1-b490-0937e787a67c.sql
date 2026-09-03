CREATE OR REPLACE FUNCTION public.redeem_credit_code(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code_id uuid;
  v_value numeric;
  v_user_id uuid;
  v_promo numeric;
  v_total numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN false; END IF;

  SELECT id, value INTO v_code_id, v_value
  FROM public.credit_codes
  WHERE code = p_code AND is_used = false
  FOR UPDATE;

  IF v_code_id IS NULL THEN RETURN false; END IF;

  -- Get promo percentage
  SELECT COALESCE(promo_credit_percent, 0) INTO v_promo FROM public.delivery_config LIMIT 1;
  v_total := v_value + (v_value * v_promo / 100);

  UPDATE public.credit_codes SET is_used = true, used_by = v_user_id, used_at = now() WHERE id = v_code_id;

  INSERT INTO public.store_credits (user_id, balance)
  VALUES (v_user_id, v_total)
  ON CONFLICT (user_id) DO UPDATE SET balance = store_credits.balance + v_total, updated_at = now();

  RETURN true;
END;
$function$;