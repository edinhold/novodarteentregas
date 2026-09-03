
CREATE OR REPLACE FUNCTION public.release_stale_directed_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  WITH updated AS (
    UPDATE public.delivery_requests
       SET driver_id = NULL, updated_at = now()
     WHERE status = 'pending'
       AND driver_id IS NOT NULL
       AND created_at < now() - interval '30 seconds'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_stale_directed_requests() TO authenticated;
