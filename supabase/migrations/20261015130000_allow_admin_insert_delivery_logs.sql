-- Migration: Allow admin and authenticated users to log push deliveries
-- Date: 2026-10-15

GRANT INSERT ON public.notification_delivery_logs TO authenticated;

DROP POLICY IF EXISTS "admins insert delivery logs" ON public.notification_delivery_logs;
CREATE POLICY "admins insert delivery logs"
  ON public.notification_delivery_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR auth.role() = 'service_role'
    OR auth.uid() IS NOT NULL
  );
