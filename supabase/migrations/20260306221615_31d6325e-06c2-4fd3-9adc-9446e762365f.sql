
CREATE TABLE public.password_reset_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  target_user_email text,
  target_user_id uuid,
  action text NOT NULL DEFAULT 'bulk_reset',
  total_users integer DEFAULT 0,
  success_count integer DEFAULT 0,
  failure_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reset logs" ON public.password_reset_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
