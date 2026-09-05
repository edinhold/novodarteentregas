CREATE TABLE IF NOT EXISTS public.push_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid,
  event_type text NOT NULL,
  onesignal_notification_id text,
  recipients_count integer NOT NULL DEFAULT 0,
  accepted_by uuid,
  status text NOT NULL DEFAULT 'ok',
  response_status integer,
  response_body_sanitized jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.push_delivery_events TO authenticated;
GRANT ALL ON public.push_delivery_events TO service_role;

ALTER TABLE public.push_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view push delivery events"
ON public.push_delivery_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_push_delivery_events_pedido ON public.push_delivery_events(pedido_id);

ALTER TABLE public.delivery_requests
  ADD COLUMN IF NOT EXISTS onesignal_notification_id text;

CREATE OR REPLACE FUNCTION public.cancel_push_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text := 'https://xnmrbsqhhjtqmgixjalw.supabase.co/functions/v1/cancelar-notificacao-pedido';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhubXJic3FoaGp0cW1naXhqYWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzM3MDQsImV4cCI6MjA4ODIwOTcwNH0.MCZh1FNBp8oYd8iL22eAXOwotsME7XarP6FFvRfJxdI';
BEGIN
  IF NEW.status <> 'pending' AND OLD.status = 'pending' THEN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon),
      body := jsonb_build_object(
        'pedido_id', NEW.id,
        'accepted_by', NEW.driver_id,
        'notification_id', NEW.onesignal_notification_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_push_on_accept ON public.delivery_requests;
CREATE TRIGGER trg_cancel_push_on_accept
AFTER UPDATE OF status ON public.delivery_requests
FOR EACH ROW
EXECUTE FUNCTION public.cancel_push_on_accept();