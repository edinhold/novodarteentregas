-- Ensure role checks used inside access rules can read roles safely without being blocked by user_roles RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

-- Allow authenticated users to use the support admin lookup function
GRANT EXECUTE ON FUNCTION public.get_support_admin_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_admin_id() TO anon;
GRANT EXECUTE ON FUNCTION public.get_support_admin_id() TO service_role;

-- Data API permissions required for the support chat table; RLS policies still restrict each row
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_direct_messages TO authenticated;
GRANT ALL ON public.admin_direct_messages TO service_role;

-- Make realtime payloads complete and ensure the table is in the realtime publication
ALTER TABLE public.admin_direct_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_direct_messages;
  END IF;
END $$;