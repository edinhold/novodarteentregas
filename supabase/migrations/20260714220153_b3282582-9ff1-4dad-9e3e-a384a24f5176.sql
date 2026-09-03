
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated can read driver-photos') THEN
    CREATE POLICY "Authenticated can read driver-photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'driver-photos');
  END IF;
END $$;
