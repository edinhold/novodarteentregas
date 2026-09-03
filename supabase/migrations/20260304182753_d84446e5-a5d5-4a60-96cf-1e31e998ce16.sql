
-- Add PIX key fields to drivers
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS pix_key text DEFAULT NULL;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS pix_key_type text DEFAULT NULL;

-- Add early withdrawal fee to delivery_config
ALTER TABLE public.delivery_config ADD COLUMN IF NOT EXISTS early_withdrawal_fee_percent numeric NOT NULL DEFAULT 10;

-- Add driver_fee to delivery_requests to track how much driver earns per delivery
ALTER TABLE public.delivery_requests ADD COLUMN IF NOT EXISTS driver_fee numeric NOT NULL DEFAULT 0;

-- Create driver_earnings table
CREATE TABLE public.driver_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  delivery_request_id uuid REFERENCES public.delivery_requests(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own earnings" ON public.driver_earnings FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_earnings.driver_id AND d.user_id = auth.uid())
);
CREATE POLICY "Admins can manage earnings" ON public.driver_earnings FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
);

-- Create withdrawal_requests table
CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  driver_user_id uuid NOT NULL,
  amount numeric NOT NULL,
  fee_percent numeric NOT NULL DEFAULT 10,
  fee_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  pix_key text,
  pix_key_type text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own withdrawals" ON public.withdrawal_requests FOR SELECT USING (driver_user_id = auth.uid());
CREATE POLICY "Drivers can create withdrawals" ON public.withdrawal_requests FOR INSERT WITH CHECK (driver_user_id = auth.uid());
CREATE POLICY "Admins can manage withdrawals" ON public.withdrawal_requests FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
);

-- Enable realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_earnings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawal_requests;
