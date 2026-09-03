
-- Allow admins to view all chat messages
CREATE POLICY "Admins can view all messages"
  ON public.chat_messages FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to send messages
CREATE POLICY "Admins can send messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND auth.uid() = sender_id);
