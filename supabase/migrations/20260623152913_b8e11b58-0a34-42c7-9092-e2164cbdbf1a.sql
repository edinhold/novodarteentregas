GRANT EXECUTE ON FUNCTION public.get_support_admin_id() TO authenticated, anon;

ALTER TABLE public.admin_direct_messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='admin_direct_messages') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_direct_messages';
  END IF;
END $$;