-- ============================================================
-- Push notifications (OneSignal) — clean rebuild
-- ============================================================

-- 1) Devices ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_type text NOT NULL,
  platform text NOT NULL,
  device_type text,
  onesignal_subscription_id text NOT NULL,
  onesignal_external_id text,
  permission_status text,
  subscription_status text,
  active boolean NOT NULL DEFAULT true,
  app_version text,
  device_model text,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_subscription_unique UNIQUE (onesignal_subscription_id),
  CONSTRAINT push_subscriptions_platform_check
    CHECK (platform IN ('android_apk','web_pwa','ios'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push devices"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read every push device"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_active_idx
  ON public.push_subscriptions (profile_type, active, subscription_status);

CREATE TRIGGER push_subscriptions_set_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Outbound queue (idempotency) -----------------------------
CREATE TABLE IF NOT EXISTS public.notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  pedido_id uuid NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  recipients_count integer DEFAULT 0,
  onesignal_notification_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT notification_jobs_status_check
    CHECK (status IN ('pending','processing','sent','no_recipients','failed','cancelled'))
);

GRANT SELECT ON public.notification_jobs TO authenticated;
GRANT ALL ON public.notification_jobs TO service_role;

ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read the notification queue"
  ON public.notification_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS notification_jobs_pedido_idx
  ON public.notification_jobs (pedido_id, created_at DESC);

-- 3) Delivery logs --------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid,
  event_type text NOT NULL,
  platform text,
  recipients_count integer DEFAULT 0,
  onesignal_notification_id text,
  response_status integer,
  response_body_sanitized jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_delivery_logs TO authenticated;
GRANT ALL ON public.notification_delivery_logs TO service_role;

ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read notification logs"
  ON public.notification_delivery_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS notification_delivery_logs_created_idx
  ON public.notification_delivery_logs (created_at DESC);

-- 4) Realtime --------------------------------------------------
ALTER TABLE public.notification_jobs REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_jobs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;