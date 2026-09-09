-- Migration for complete OneSignal Integration & Driver Device Push Fix

-- 1. Ensure push_subscriptions table structure, indexes, and RLS
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_type text NOT NULL DEFAULT 'driver',
  platform text NOT NULL,
  device_name text,
  onesignal_subscription_id text NOT NULL,
  onesignal_external_id text,
  permission_status text NOT NULL DEFAULT 'unknown',
  subscription_status text NOT NULL DEFAULT 'unknown',
  active boolean NOT NULL DEFAULT true,
  app_version text,
  sdk_version text,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT push_subscriptions_onesignal_sub_unique UNIQUE (onesignal_subscription_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own subscriptions select" ON public.push_subscriptions;
CREATE POLICY "own subscriptions select" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "own subscriptions insert" ON public.push_subscriptions;
CREATE POLICY "own subscriptions insert" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own subscriptions update" ON public.push_subscriptions;
CREATE POLICY "own subscriptions update" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "own subscriptions delete" ON public.push_subscriptions;
CREATE POLICY "own subscriptions delete" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_active ON public.push_subscriptions(active, subscription_status);

-- 2. Ensure driver_push_devices table structure, indexes, and RLS
CREATE TABLE IF NOT EXISTS public.driver_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  external_id uuid,
  subscription_id text NOT NULL,
  platform text NOT NULL DEFAULT 'web_pwa',
  active boolean NOT NULL DEFAULT true,
  subscription_status text NOT NULL DEFAULT 'active',
  permission_status text NOT NULL DEFAULT 'granted',
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT driver_push_devices_subscription_unique UNIQUE (subscription_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_push_devices TO authenticated;
GRANT ALL ON public.driver_push_devices TO service_role;
ALTER TABLE public.driver_push_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drivers manage own push devices select" ON public.driver_push_devices;
CREATE POLICY "drivers manage own push devices select" ON public.driver_push_devices
  FOR SELECT TO authenticated USING (driver_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "drivers manage own push devices insert" ON public.driver_push_devices;
CREATE POLICY "drivers manage own push devices insert" ON public.driver_push_devices
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "drivers manage own push devices update" ON public.driver_push_devices;
CREATE POLICY "drivers manage own push devices update" ON public.driver_push_devices
  FOR UPDATE TO authenticated USING (driver_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "drivers manage own push devices delete" ON public.driver_push_devices;
CREATE POLICY "drivers manage own push devices delete" ON public.driver_push_devices
  FOR DELETE TO authenticated USING (driver_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_driver_push_devices_driver ON public.driver_push_devices(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_push_devices_active ON public.driver_push_devices(active, subscription_status);

-- 3. Trigger Function on delivery_requests to notify available drivers
CREATE OR REPLACE FUNCTION public.notify_onesignal_on_new_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text := 'https://qhlunszfcpzsfjjugkus.supabase.co/functions/v1/notify-available-drivers';
  v_anon text := 'sb_publishable_xp0FiNgyQFvsdy9SXeGnSA_iUehC_FO';
BEGIN
  IF NEW.status = 'pending' AND NEW.driver_id IS NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon
        ),
        body := jsonb_build_object('pedido_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log warning without throwing to ensure order creation is never blocked by notification failure
      RAISE WARNING 'Erro ao invocar trigger de notificação pg_net: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_onesignal_on_new_request ON public.delivery_requests;
CREATE TRIGGER trg_notify_onesignal_on_new_request
  AFTER INSERT ON public.delivery_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_onesignal_on_new_request();
