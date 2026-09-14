-- Migration: Fix admin_set_user_password overloads and PostgREST schema cache reload

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Main signature (UUID target_user_id, TEXT new_password)
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

-- 2. Overload signature (TEXT new_password, UUID target_user_id)
CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_new_password TEXT,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  RETURN public.admin_set_user_password(p_target_user_id, p_new_password);
END;
$$;

-- 3. Overload signature (TEXT target_user_id, TEXT new_password)
CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_target_user_id TEXT,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  RETURN public.admin_set_user_password(p_target_user_id::UUID, p_new_password);
END;
$$;

-- 4. Overload signature (TEXT new_password, TEXT target_user_id)
CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_new_password TEXT,
  p_target_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  RETURN public.admin_set_user_password(p_target_user_id::UUID, p_new_password);
END;
$$;

-- Grant permissions to authenticated, anon, service_role across all overloads
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(TEXT, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(TEXT, TEXT) TO authenticated, anon, service_role;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
