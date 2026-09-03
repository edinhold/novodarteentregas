
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_request_id uuid REFERENCES public.delivery_requests(id);
