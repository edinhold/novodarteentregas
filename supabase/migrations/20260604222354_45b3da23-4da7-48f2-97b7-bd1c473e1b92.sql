CREATE OR REPLACE FUNCTION public.redeem_credit_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id uuid;
  v_value numeric;
  v_user_id uuid;
  v_promo numeric;
  v_total numeric;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN 
    RAISE LOG 'redeem_credit_code: No authenticated user';
    RETURN false; 
  END IF;

  -- Find the valid code and lock it for update
  SELECT id, value INTO v_code_id, v_value
  FROM public.credit_codes
  WHERE code = p_code AND is_used = false
  FOR UPDATE;

  IF v_code_id IS NULL THEN 
    RAISE LOG 'redeem_credit_code: Code % not found or already used', p_code;
    RETURN false; 
  END IF;

  -- Get promo percentage from config
  SELECT COALESCE(promo_credit_percent, 0) INTO v_promo FROM public.delivery_config LIMIT 1;
  
  -- Calculate total credits to add
  v_total := v_value + (v_value * COALESCE(v_promo, 0) / 100);

  -- Mark code as used
  UPDATE public.credit_codes 
  SET is_used = true, 
      used_by = v_user_id, 
      used_at = now() 
  WHERE id = v_code_id;

  -- Update or insert store credits
  INSERT INTO public.store_credits (user_id, balance)
  VALUES (v_user_id, v_total)
  ON CONFLICT (user_id) DO UPDATE 
  SET balance = public.store_credits.balance + v_total, 
      updated_at = now();

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'redeem_credit_code error: %', SQLERRM;
  RETURN false;
END;
$$;

-- Ensure permissions are correct
REVOKE EXECUTE ON FUNCTION public.redeem_credit_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO service_role;
