
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_type text not null default 'driver',
  platform text not null,
  device_name text,
  onesignal_subscription_id text not null,
  onesignal_external_id text,
  permission_status text not null default 'unknown',
  subscription_status text not null default 'unknown',
  active boolean not null default true,
  app_version text,
  sdk_version text,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (onesignal_subscription_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own subscriptions select" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "own subscriptions insert" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own subscriptions update" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "own subscriptions delete" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_active ON public.push_subscriptions(active, subscription_status);

CREATE TRIGGER trg_push_subs_updated_at BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  pedido_id uuid,
  event_type text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  recipients_count integer not null default 0,
  onesignal_notification_id text,
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz default now(),
  processed_at timestamptz
);

GRANT SELECT ON public.notification_jobs TO authenticated;
GRANT ALL ON public.notification_jobs TO service_role;
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read jobs" ON public.notification_jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid,
  event_type text not null,
  request_id uuid,
  recipients_requested integer not null default 0,
  recipients_found integer not null default 0,
  onesignal_notification_id text,
  response_status integer,
  response_body_sanitized text,
  error_code text,
  platform text,
  created_at timestamptz default now()
);

GRANT SELECT ON public.notification_delivery_logs TO authenticated;
GRANT ALL ON public.notification_delivery_logs TO service_role;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read delivery logs" ON public.notification_delivery_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_notif_logs_created ON public.notification_delivery_logs(created_at DESC);
