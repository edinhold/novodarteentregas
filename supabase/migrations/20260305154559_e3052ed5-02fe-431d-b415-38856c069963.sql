
CREATE TABLE public.driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  user_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision DEFAULT 0,
  heading double precision,
  speed double precision,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX driver_locations_user_id_idx ON public.driver_locations (user_id);

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Everyone can view driver locations (for map display)
CREATE POLICY "Anyone can view driver locations"
  ON public.driver_locations FOR SELECT
  USING (true);

-- Drivers can upsert their own location
CREATE POLICY "Drivers can upsert own location"
  ON public.driver_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Drivers can update own location"
  ON public.driver_locations FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
