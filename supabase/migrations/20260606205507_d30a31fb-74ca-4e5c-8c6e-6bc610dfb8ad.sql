
ALTER TABLE public.store_driver_favorites
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS store_driver_favorites_one_default_per_restaurant
  ON public.store_driver_favorites (restaurant_id)
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.set_default_favorite_driver(p_favorite_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_restaurant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT sdf.restaurant_id INTO v_restaurant_id
  FROM public.store_driver_favorites sdf
  JOIN public.restaurants r ON r.id = sdf.restaurant_id
  WHERE sdf.id = p_favorite_id
    AND r.owner_id = v_user_id;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Favorito não encontrado ou sem permissão';
  END IF;

  UPDATE public.store_driver_favorites
    SET is_default = false
    WHERE restaurant_id = v_restaurant_id AND is_default = true;

  UPDATE public.store_driver_favorites
    SET is_default = true
    WHERE id = p_favorite_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_favorite_driver(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_favorite_driver(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reassign_delivery_driver(p_request_id uuid, p_driver_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_request RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id, store_owner_id, status
  INTO v_request
  FROM public.delivery_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_request.store_owner_id <> v_user_id AND NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Só é possível trocar o entregador antes da aceitação';
  END IF;

  -- Validate target user has driver role (allow NULL to clear)
  IF p_driver_user_id IS NOT NULL AND NOT public.has_role(p_driver_user_id, 'driver'::app_role) THEN
    RAISE EXCEPTION 'Usuário alvo não é um entregador válido';
  END IF;

  UPDATE public.delivery_requests
    SET driver_id = p_driver_user_id, updated_at = now()
    WHERE id = p_request_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_delivery_driver(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_delivery_driver(uuid, uuid) TO authenticated;
