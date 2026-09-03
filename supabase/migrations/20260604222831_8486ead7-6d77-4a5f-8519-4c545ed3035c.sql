-- handle_new_user should ONLY be executed by the database (auth trigger)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- ensure complete_delivery is only callable by authenticated users
-- (it was already granted to authenticated, but let's be explicit and remove public/anon)
REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;

-- deduct_credits_for_delivery is also authenticated only
REVOKE EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) TO authenticated;

-- redeem_credit_code is authenticated only
REVOKE EXECUTE ON FUNCTION public.redeem_credit_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO authenticated;
