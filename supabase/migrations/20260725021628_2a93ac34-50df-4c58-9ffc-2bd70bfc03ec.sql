
CREATE TABLE IF NOT EXISTS public.customer_deletion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  deleted_user_id uuid NOT NULL,
  deleted_name text,
  deleted_phone text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.customer_deletion_logs TO authenticated;
GRANT ALL ON public.customer_deletion_logs TO service_role;
ALTER TABLE public.customer_deletion_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view deletion logs" ON public.customer_deletion_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert deletion logs" ON public.customer_deletion_logs
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND admin_id = auth.uid());
