CREATE TABLE public.admin_direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.admin_direct_messages TO authenticated;
GRANT ALL ON public.admin_direct_messages TO service_role;

ALTER TABLE public.admin_direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all support messages"
  ON public.admin_direct_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users read own admin thread"
  ON public.admin_direct_messages FOR SELECT TO authenticated
  USING (
    (sender_id = auth.uid() AND public.has_role(recipient_id, 'admin'::app_role))
    OR (recipient_id = auth.uid() AND public.has_role(sender_id, 'admin'::app_role))
  );

CREATE POLICY "Users send to admin"
  ON public.admin_direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.has_role(recipient_id, 'admin'::app_role)
  );

CREATE INDEX idx_admin_dm_pair ON public.admin_direct_messages (sender_id, recipient_id, created_at);
CREATE INDEX idx_admin_dm_recipient ON public.admin_direct_messages (recipient_id, created_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_direct_messages;