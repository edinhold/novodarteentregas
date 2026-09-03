ALTER FUNCTION public.redeem_credit_code(text) SECURITY INVOKER;
ALTER FUNCTION public.has_role(uuid, app_role) SECURITY INVOKER;
ALTER FUNCTION public.is_store_owner_of_driver(uuid) SECURITY INVOKER;
ALTER FUNCTION public.delete_all_chat_messages() SECURITY INVOKER;
ALTER FUNCTION public.place_order(uuid, jsonb, text, text, text) SECURITY INVOKER;
ALTER FUNCTION public.complete_delivery(uuid) SECURITY INVOKER;
ALTER FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric) SECURITY INVOKER;
ALTER FUNCTION public.request_withdrawal() SECURITY INVOKER;
