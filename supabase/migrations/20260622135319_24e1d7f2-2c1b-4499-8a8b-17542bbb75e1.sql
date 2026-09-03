CREATE OR REPLACE FUNCTION public.get_assigned_driver_info(p_request_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  phone text,
  vehicle_type text,
  vehicle_plate text,
  photo_url text,
  driver_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT store_owner_id, driver_id INTO v_req
  FROM public.delivery_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_req.driver_id IS NULL THEN
    RETURN;
  END IF;

  IF v_req.store_owner_id <> v_user
     AND v_req.driver_id <> v_user
     AND NOT public.has_role(v_user, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  RETURN QUERY
  SELECT d.user_id, d.full_name, d.phone, d.vehicle_type, d.vehicle_plate, d.photo_url, d.driver_code
  FROM public.drivers d
  WHERE d.user_id = v_req.driver_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assigned_driver_info(uuid) TO authenticated;