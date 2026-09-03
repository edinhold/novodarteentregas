
CREATE TABLE IF NOT EXISTS public.push_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  driver_user_id uuid NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_notification_logs_unique UNIQUE (request_id, driver_user_id)
);

CREATE INDEX IF NOT EXISTS idx_push_logs_request ON public.push_notification_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_driver ON public.push_notification_logs(driver_user_id);

GRANT SELECT ON public.push_notification_logs TO authenticated;
GRANT ALL  ON public.push_notification_logs TO service_role;

ALTER TABLE public.push_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view push logs"
  ON public.push_notification_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));
