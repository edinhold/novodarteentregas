
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_drivers_is_online ON public.drivers(is_online) WHERE is_online = true;

-- Allow authenticated drivers to update their own online flag (policy already covers self updates if exists; ensure)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='drivers' AND policyname='Drivers can update own online'
  ) THEN
    CREATE POLICY "Drivers can update own online"
      ON public.drivers
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END$$;

-- Trigger function: call OneSignal edge function on new pending delivery
CREATE OR REPLACE FUNCTION public.notify_onesignal_on_new_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url text := 'https://xnmrbsqhhjtqmgixjalw.supabase.co/functions/v1/send-onesignal-delivery';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhubXJic3FoaGp0cW1naXhqYWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzM3MDQsImV4cCI6MjA4ODIwOTcwNH0.MCZh1FNBp8oYd8iL22eAXOwotsME7XarP6FFvRfJxdI';
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon),
      body := jsonb_build_object(
        'request_id', NEW.id,
        'driver_id', NEW.driver_id,
        'driver_fee', NEW.driver_fee,
        'pickup_address', NEW.pickup_address,
        'delivery_address', NEW.delivery_address
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_onesignal_on_new_request ON public.delivery_requests;
CREATE TRIGGER trg_notify_onesignal_on_new_request
AFTER INSERT ON public.delivery_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_onesignal_on_new_request();
