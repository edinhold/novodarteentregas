REVOKE EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.redeem_credit_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO service_role;