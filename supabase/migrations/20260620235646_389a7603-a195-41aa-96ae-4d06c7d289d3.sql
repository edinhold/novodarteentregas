
-- Push subscriptions table
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);

-- Enable pg_net for HTTP from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger: notify drivers via edge function on new pending delivery_requests
CREATE OR REPLACE FUNCTION public.notify_drivers_on_new_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://xnmrbsqhhjtqmgixjalw.supabase.co/functions/v1/send-delivery-push';
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
$$;

CREATE TRIGGER trg_notify_drivers_on_new_request
  AFTER INSERT ON public.delivery_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_drivers_on_new_request();
