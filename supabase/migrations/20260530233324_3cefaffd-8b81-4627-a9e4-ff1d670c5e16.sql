-- Add driver_code to drivers table if it doesn't exist
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS driver_code TEXT UNIQUE;

-- Create a table for store-driver preferences (favorites)
CREATE TABLE IF NOT EXISTS public.store_driver_favorites (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(restaurant_id, driver_id)
);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.store_driver_favorites TO authenticated;
GRANT ALL ON public.store_driver_favorites TO service_role;

-- Enable RLS
ALTER TABLE public.store_driver_favorites ENABLE ROW LEVEL SECURITY;

-- Policies for favorites using restaurants table
CREATE POLICY "Restaurant owners can manage their favorite drivers" 
ON public.store_driver_favorites 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.restaurants r 
        WHERE r.id = restaurant_id AND r.owner_id = auth.uid()
    )
);

-- Function to generate a short driver code if empty
CREATE OR REPLACE FUNCTION public.generate_driver_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.driver_code IS NULL THEN
        NEW.driver_code := 'DRV' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 5));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for driver code
DROP TRIGGER IF EXISTS trigger_generate_driver_code ON public.drivers;
CREATE TRIGGER trigger_generate_driver_code
BEFORE INSERT ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.generate_driver_code();

-- Update existing drivers without a code (using a CTE to avoid multiple gen_random_uuid() calls returning the same value in some contexts)
WITH updated_drivers AS (
  SELECT id, 'DRV' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 5)) as new_code
  FROM public.drivers
  WHERE driver_code IS NULL
)
UPDATE public.drivers d
SET driver_code = ud.new_code
FROM updated_drivers ud
WHERE d.id = ud.id;
