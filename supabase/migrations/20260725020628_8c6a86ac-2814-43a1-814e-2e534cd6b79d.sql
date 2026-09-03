CREATE TABLE public.admin_impersonation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_email text,
  target_role text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_impersonation_logs TO authenticated;
GRANT ALL ON public.admin_impersonation_logs TO service_role;
ALTER TABLE public.admin_impersonation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view impersonation logs"
  ON public.admin_impersonation_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));