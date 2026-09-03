-- Update function to set search_path
CREATE OR REPLACE FUNCTION public.handle_driver_location_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
