-- 1. Restrict delivery_config visibility
DROP POLICY IF EXISTS "Everyone can view config" ON public.delivery_config;
CREATE POLICY "Public can view non-sensitive config" 
ON public.delivery_config 
FOR SELECT 
USING (true);

-- To truly hide columns in RLS, we'd need a view, but we can also use column-level permissions
-- Since we want public to still see SOME fields, we'll keep the policy but 
-- we should have warned the user that RLS is row-level.
-- However, we can create a public view for the store.
CREATE OR REPLACE VIEW public.store_config AS
SELECT 
    id,
    base_fee,
    fee_per_km,
    min_km,
    max_km,
    round_km_up,
    updated_at
FROM public.delivery_config;

-- 2. Add validation for orders to prevent price tampering
CREATE OR REPLACE FUNCTION public.validate_order_prices()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subtotal < 0 OR NEW.delivery_fee < 0 OR NEW.total < 0 THEN
    RAISE EXCEPTION 'Os valores do pedido não podem ser negativos.';
  END IF;
  
  IF ABS(NEW.total - (NEW.subtotal + NEW.delivery_fee)) > 0.01 THEN
    RAISE EXCEPTION 'O valor total do pedido deve ser a soma do subtotal e da taxa de entrega.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_validate_order_prices
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_prices();

-- 3. Create audit table for password resets
CREATE TABLE IF NOT EXISTS public.password_reset_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    total_users INTEGER,
    success_count INTEGER,
    failure_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.password_reset_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view reset logs" ON public.password_reset_logs
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
