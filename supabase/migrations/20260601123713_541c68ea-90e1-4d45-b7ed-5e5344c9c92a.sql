-- Allow all authenticated users to view driver profiles (needed for the global map)
CREATE POLICY "Allow authenticated to view all drivers" ON public.drivers
    FOR SELECT TO authenticated
    USING (true);

-- Ensure driver_locations is also visible to all authenticated users (already exists but reinforcing)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'driver_locations' AND policyname = 'Authenticated users can view driver locations'
    ) THEN
        CREATE POLICY "Authenticated users can view driver locations" ON public.driver_locations
            FOR SELECT TO authenticated
            USING (true);
    END IF;
END $$;
