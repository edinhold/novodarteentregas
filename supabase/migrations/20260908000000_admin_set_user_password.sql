-- Migration: RPC for Admin Password Reset
-- Allows administrators to safely reset any user's password directly in auth.users via SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_target_user_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Verify caller is admin if called within auth context
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar esta operação.';
  END IF;

  IF p_target_user_id IS NULL OR p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter pelo menos 6 caracteres.';
  END IF;

  -- Update auth.users password securely
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Senha redefinida com sucesso.'
  );
END;
$$;

-- Grant execute permissions to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(UUID, TEXT) TO authenticated, service_role;
