-- Migration: Add hidden_by_store to delivery_requests & delivery_groups for store owner history cleanup

-- 1. Add hidden_by_store columns
ALTER TABLE public.delivery_requests
  ADD COLUMN IF NOT EXISTS hidden_by_store BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.delivery_groups
  ADD COLUMN IF NOT EXISTS hidden_by_store BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for quick lookup of non-hidden requests per store
CREATE INDEX IF NOT EXISTS idx_delivery_requests_store_hidden
  ON public.delivery_requests(store_owner_id, hidden_by_store);

-- 2. RPC function to hide an individual delivery request for store owner
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
     AND (store_owner_id = v_user_id OR public.has_role(v_user_id, 'admin'::app_role));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hide_store_delivery_request(uuid) TO authenticated, service_role;

-- 3. RPC function for bulk clearing delivery history by period or all finished
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
     WHERE store_owner_id = v_user_id
       AND status IN ('delivered', 'cancelled')
       AND hidden_by_store = false;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.delivery_groups
       SET hidden_by_store = true, updated_at = now()
     WHERE store_owner_id = v_user_id
       AND status IN ('delivered', 'cancelled')
       AND hidden_by_store = false;
  ELSIF v_cutoff IS NOT NULL THEN
    UPDATE public.delivery_requests
       SET hidden_by_store = true, updated_at = now()
     WHERE store_owner_id = v_user_id
       AND status IN ('delivered', 'cancelled')
       AND created_at < v_cutoff
       AND hidden_by_store = false;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.delivery_groups
       SET hidden_by_store = true, updated_at = now()
     WHERE store_owner_id = v_user_id
       AND status IN ('delivered', 'cancelled')
       AND created_at < v_cutoff
       AND hidden_by_store = false;
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_store_delivery_history(int, boolean) TO authenticated, service_role;
