-- Suspension fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- Audit log
CREATE TABLE IF NOT EXISTS public.user_suspension_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action text NOT NULL, -- 'suspend' | 'unsuspend'
  reason text,
  suspended_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_suspension_logs TO authenticated;
GRANT ALL ON public.user_suspension_logs TO service_role;

ALTER TABLE public.user_suspension_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view suspension logs"
  ON public.user_suspension_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert suspension logs"
  ON public.user_suspension_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND admin_user_id = auth.uid());

-- Suspend user RPC
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_target_user_id uuid,
  p_until timestamptz,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem suspender usuários';
  END IF;
  IF p_target_user_id = v_caller THEN
    RAISE EXCEPTION 'Você não pode suspender a si mesmo';
  END IF;
  IF public.has_role(p_target_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Não é possível suspender outro administrador';
  END IF;

  UPDATE public.profiles
     SET suspended_until = p_until,
         suspension_reason = p_reason,
         suspended_by = v_caller,
         suspended_at = now(),
         updated_at = now()
   WHERE user_id = p_target_user_id;

  INSERT INTO public.user_suspension_logs (admin_user_id, target_user_id, action, reason, suspended_until)
  VALUES (v_caller, p_target_user_id, 'suspend', p_reason, p_until);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem reativar usuários';
  END IF;

  UPDATE public.profiles
     SET suspended_until = NULL,
         suspension_reason = NULL,
         suspended_by = NULL,
         suspended_at = NULL,
         updated_at = now()
   WHERE user_id = p_target_user_id;

  INSERT INTO public.user_suspension_logs (admin_user_id, target_user_id, action, reason, suspended_until)
  VALUES (v_caller, p_target_user_id, 'unsuspend', NULL, NULL);

  RETURN true;
END;
$$;

-- Read own suspension (so client can enforce logout)
CREATE OR REPLACE FUNCTION public.get_my_suspension()
RETURNS TABLE(suspended_until timestamptz, suspension_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT suspended_until, suspension_reason
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_suspension() TO authenticated;