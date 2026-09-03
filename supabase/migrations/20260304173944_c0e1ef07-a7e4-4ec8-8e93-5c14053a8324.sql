
-- Delivery config (admin-managed fee settings)
CREATE TABLE public.delivery_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_fee numeric NOT NULL DEFAULT 5,
  fee_per_km numeric NOT NULL DEFAULT 1.5,
  credit_cost_per_call numeric NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view config" ON public.delivery_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage config" ON public.delivery_config FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.delivery_config (base_fee, fee_per_km, credit_cost_per_call) VALUES (5, 1.5, 3);

-- Store owner credits
CREATE TABLE public.store_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own credits" ON public.store_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage credits" ON public.store_credits FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Credit codes (admin generates, store owners redeem)
CREATE TABLE public.credit_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  value numeric NOT NULL DEFAULT 10,
  is_used boolean NOT NULL DEFAULT false,
  used_by uuid,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage codes" ON public.credit_codes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Store owners can view unused codes" ON public.credit_codes FOR SELECT USING (true);

-- Delivery requests (store owner calls driver)
CREATE TABLE public.delivery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_owner_id uuid NOT NULL,
  restaurant_id uuid REFERENCES public.restaurants(id),
  driver_id uuid,
  status text NOT NULL DEFAULT 'pending',
  pickup_address text,
  delivery_address text,
  notes text,
  credit_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store owners can create requests" ON public.delivery_requests FOR INSERT WITH CHECK (auth.uid() = store_owner_id);
CREATE POLICY "Store owners can view own requests" ON public.delivery_requests FOR SELECT USING (auth.uid() = store_owner_id);
CREATE POLICY "Drivers can view pending requests" ON public.delivery_requests FOR SELECT USING (status = 'pending' OR driver_id = auth.uid());
CREATE POLICY "Drivers can accept requests" ON public.delivery_requests FOR UPDATE USING (status = 'pending' OR driver_id = auth.uid());
CREATE POLICY "Admins can manage requests" ON public.delivery_requests FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Chat messages between store owner and driver
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view messages" ON public.chat_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.delivery_requests dr
    WHERE dr.id = delivery_request_id
    AND (dr.store_owner_id = auth.uid() OR dr.driver_id = auth.uid())
  )
);
CREATE POLICY "Participants can send messages" ON public.chat_messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.delivery_requests dr
    WHERE dr.id = delivery_request_id
    AND (dr.store_owner_id = auth.uid() OR dr.driver_id = auth.uid())
  )
);

-- Enable realtime for chat and delivery requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_requests;

-- Function to redeem credit code
CREATE OR REPLACE FUNCTION public.redeem_credit_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id uuid;
  v_value numeric;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN false; END IF;

  SELECT id, value INTO v_code_id, v_value
  FROM public.credit_codes
  WHERE code = p_code AND is_used = false
  FOR UPDATE;

  IF v_code_id IS NULL THEN RETURN false; END IF;

  UPDATE public.credit_codes SET is_used = true, used_by = v_user_id, used_at = now() WHERE id = v_code_id;

  INSERT INTO public.store_credits (user_id, balance)
  VALUES (v_user_id, v_value)
  ON CONFLICT (user_id) DO UPDATE SET balance = store_credits.balance + v_value, updated_at = now();

  RETURN true;
END;
$$;

-- Add unique constraint on store_credits.user_id
ALTER TABLE public.store_credits ADD CONSTRAINT store_credits_user_id_unique UNIQUE (user_id);

-- Trigger for updated_at
CREATE TRIGGER update_delivery_requests_updated_at BEFORE UPDATE ON public.delivery_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_store_credits_updated_at BEFORE UPDATE ON public.store_credits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
