-- Fix: restrict self-insert on user_roles to only safe roles (user, driver, store_owner)
-- Prevents privilege escalation to admin/moderator
DROP POLICY IF EXISTS "Authenticated can insert own role" ON public.user_roles;
CREATE POLICY "Authenticated can insert own safe role" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND role IN ('user'::app_role, 'driver'::app_role, 'store_owner'::app_role)
);