-- Create or replace function to update timestamps
CREATE OR REPLACE FUNCTION public.handle_driver_location_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for driver_locations
DROP TRIGGER IF EXISTS update_driver_locations_timestamp ON public.driver_locations;
CREATE TRIGGER update_driver_locations_timestamp
BEFORE UPDATE ON public.driver_locations
FOR EACH ROW
EXECUTE FUNCTION public.handle_driver_location_update();
