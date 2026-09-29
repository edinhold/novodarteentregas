-- Migration: Ensure hidden_by_store column exists and reload PostgREST schema cache

-- 1. Ensure hidden_by_store columns exist
ALTER TABLE public.delivery_requests
  ADD COLUMN IF NOT EXISTS hidden_by_store BOOLEAN DEFAULT FALSE;

ALTER TABLE public.delivery_groups
  ADD COLUMN IF NOT EXISTS hidden_by_store BOOLEAN DEFAULT FALSE;

-- Set default false for any NULL entries
UPDATE public.delivery_requests SET hidden_by_store = FALSE WHERE hidden_by_store IS NULL;
UPDATE public.delivery_groups SET hidden_by_store = FALSE WHERE hidden_by_store IS NULL;

-- Create index for quick lookup
CREATE INDEX IF NOT EXISTS idx_delivery_requests_store_hidden
  ON public.delivery_requests(store_owner_id, hidden_by_store);

-- 2. Enhanced RPC function to hide an individual delivery request for store owner or restaurant
CREATE OR REPLACE FUNCTION public.hide_store_delivery_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  UPDATE public.delivery_requests
     SET hidden_by_store = true, updated_at = now()
   WHERE id = p_request_id
     AND (
       store_owner_id = v_user_id 
       OR restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = v_user_id)
       OR public.has_role(v_user_id, 'admin'::app_role)
     );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hide_store_delivery_request(uuid) TO authenticated, service_role;

-- 3. Enhanced RPC function for bulk clearing delivery history
CREATE OR REPLACE FUNCTION public.clear_store_delivery_history(
  p_days int DEFAULT NULL,
  p_clear_all boolean DEFAULT FALSE
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int := 0;
  v_cutoff timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_days IS NOT NULL AND p_days > 0 THEN
    v_cutoff := now() - (p_days || ' days')::interval;
  END IF;

  IF p_clear_all THEN
    UPDATE public.delivery_requests
       SET hidden_by_store = true, updated_at = now()
     WHERE (
             store_owner_id = v_user_id 
             OR restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = v_user_id)
             OR public.has_role(v_user_id, 'admin'::app_role)
           )
       AND status IN ('delivered', 'cancelled')
       AND (hidden_by_store = false OR hidden_by_store IS NULL);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.delivery_groups
       SET hidden_by_store = true, updated_at = now()
     WHERE (
             store_owner_id = v_user_id 
             OR restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = v_user_id)
             OR public.has_role(v_user_id, 'admin'::app_role)
           )
       AND status IN ('delivered', 'cancelled')
       AND (hidden_by_store = false OR hidden_by_store IS NULL);
  ELSIF v_cutoff IS NOT NULL THEN
    UPDATE public.delivery_requests
       SET hidden_by_store = true, updated_at = now()
     WHERE (
             store_owner_id = v_user_id 
             OR restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = v_user_id)
             OR public.has_role(v_user_id, 'admin'::app_role)
           )
       AND status IN ('delivered', 'cancelled')
       AND created_at < v_cutoff
       AND (hidden_by_store = false OR hidden_by_store IS NULL);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.delivery_groups
       SET hidden_by_store = true, updated_at = now()
     WHERE (
             store_owner_id = v_user_id 
             OR restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = v_user_id)
             OR public.has_role(v_user_id, 'admin'::app_role)
           )
       AND status IN ('delivered', 'cancelled')
       AND created_at < v_cutoff
       AND (hidden_by_store = false OR hidden_by_store IS NULL);
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_store_delivery_history(int, boolean) TO authenticated, service_role;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
