-- Create audit table for financial value adjustments by admins
CREATE TABLE IF NOT EXISTS public.financial_adjustment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  admin_email text,
  transaction_id text NOT NULL,
  store_id text,
  store_name text,
  movement_type text NOT NULL,
  old_value numeric NOT NULL,
  new_value numeric NOT NULL,
  adjustment_amount numeric NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Permissions
GRANT SELECT, INSERT ON public.financial_adjustment_logs TO authenticated;
GRANT ALL ON public.financial_adjustment_logs TO service_role;

-- Enable RLS
ALTER TABLE public.financial_adjustment_logs ENABLE ROW LEVEL SECURITY;

-- Policies for admins
DROP POLICY IF EXISTS "Admins view financial adjustment logs" ON public.financial_adjustment_logs;
CREATE POLICY "Admins view financial adjustment logs"
  ON public.financial_adjustment_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins insert financial adjustment logs" ON public.financial_adjustment_logs;
CREATE POLICY "Admins insert financial adjustment logs"
  ON public.financial_adjustment_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
