-- Migration: Admin password reset and requests deletion permissions

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Ensure RLS policies on admin_requests allow full admin management (including DELETE)
ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage admin requests" ON public.admin_requests;
CREATE POLICY "Admins can manage admin requests"
  ON public.admin_requests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Create or Replace admin_set_user_password RPC
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
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar esta operação.';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'ID do usuário é obrigatório.';
  END IF;

  IF p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter pelo menos 6 caracteres.';
  END IF;

  -- Update auth.users password securely via bcrypt crypt()
  UPDATE auth.users
  SET encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
      updated_at = now()
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado no sistema de autenticação.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Senha redefinida com sucesso.'
  );
END;
$$;

-- Grant execute permissions to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(UUID, TEXT) TO authenticated, service_role;
