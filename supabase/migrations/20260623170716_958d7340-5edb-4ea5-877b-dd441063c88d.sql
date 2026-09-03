-- Support messages are private: remove anonymous/public table access and keep access for logged-in users only
REVOKE ALL ON TABLE public.admin_direct_messages FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_direct_messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_direct_messages TO authenticated;
GRANT ALL ON TABLE public.admin_direct_messages TO service_role;