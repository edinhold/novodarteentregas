-- Migration: Ensure driver_earnings columns exist & notify PostgREST schema reload

ALTER TABLE public.driver_earnings 
  ADD COLUMN IF NOT EXISTS adjustment_type text,
  ADD COLUMN IF NOT EXISTS created_by_admin_id uuid,
  ADD COLUMN IF NOT EXISTS description text;

NOTIFY pgrst, 'reload schema';
