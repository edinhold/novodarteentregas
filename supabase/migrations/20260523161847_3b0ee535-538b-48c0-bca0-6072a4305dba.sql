-- Function to delete all chat messages, only callable by admins
CREATE OR REPLACE FUNCTION public.delete_all_chat_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the calling user is an admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado. Somente administradores podem realizar esta ação.';
  END IF;

  DELETE FROM public.chat_messages;
END;
$$;

-- Revoke execute from public/anon/authenticated by default
REVOKE EXECUTE ON FUNCTION public.delete_all_chat_messages() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_all_chat_messages() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_all_chat_messages() FROM authenticated;

-- Grant execute only to service_role and specifically to authenticated (since we check role inside)
GRANT EXECUTE ON FUNCTION public.delete_all_chat_messages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_chat_messages() TO service_role;

-- Clean existing messages immediately
DELETE FROM public.chat_messages;