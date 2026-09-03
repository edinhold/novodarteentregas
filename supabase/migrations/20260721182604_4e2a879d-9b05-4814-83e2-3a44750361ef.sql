CREATE TABLE IF NOT EXISTS public.onesignal_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  subscription_id text,
  onesignal_user_id text,
  platform text,
  status text DEFAULT 'active',
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, subscription_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onesignal_devices TO authenticated;
GRANT ALL ON public.onesignal_devices TO service_role;

ALTER TABLE public.onesignal_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own onesignal devices"
  ON public.onesignal_devices
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_onesignal_devices_user ON public.onesignal_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_onesignal_devices_external ON public.onesignal_devices(external_id);

CREATE TRIGGER update_onesignal_devices_updated_at
  BEFORE UPDATE ON public.onesignal_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();