-- Secure SECURITY DEFINER functions by revoking default PUBLIC execute
REVOKE EXECUTE ON FUNCTION public.redeem_credit_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_credit_code(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_store_owner_of_driver(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_store_owner_of_driver(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_all_chat_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_all_chat_messages() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal() TO authenticated;

-- Ensure RLS on delivery_requests covers all participants correctly
DROP POLICY IF EXISTS "Store owners can view own requests" ON public.delivery_requests;
CREATE POLICY "Store owners can view own requests" 
ON public.delivery_requests 
FOR SELECT 
TO authenticated
USING (auth.uid() = store_owner_id OR has_role(auth.uid(), 'admin'));

-- Ensure orders can be viewed by the store owner as well
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM public.restaurants r 
    WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
  )
);
