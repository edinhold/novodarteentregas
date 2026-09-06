-- Migration to add driver_id and driver_name columns to financial_adjustment_logs
ALTER TABLE public.financial_adjustment_logs
  ADD COLUMN IF NOT EXISTS driver_id text,
  ADD COLUMN IF NOT EXISTS driver_name text;
