ALTER TABLE public.delivery_config 
  ADD COLUMN IF NOT EXISTS min_km numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_km numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_km_up boolean NOT NULL DEFAULT false;