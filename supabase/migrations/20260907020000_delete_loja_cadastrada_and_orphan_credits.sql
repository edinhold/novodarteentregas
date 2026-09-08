-- Migration: Delete 'Loja Cadastrada' and orphan store credits from non-existent stores

-- 1. Excluir registros de store_credits de lojas que não existem em restaurants ou com nome 'Loja Cadastrada'
DELETE FROM public.store_credits
WHERE user_id NOT IN (SELECT owner_id FROM public.restaurants WHERE owner_id IS NOT NULL)
   OR user_id IN (SELECT owner_id FROM public.restaurants WHERE LOWER(name) LIKE '%loja cadastrada%');

-- 2. Excluir recargas de lojas descontinuadas ou com nome 'Loja Cadastrada'
DELETE FROM public.store_recharges
WHERE (store_owner_id IS NOT NULL AND store_owner_id NOT IN (SELECT owner_id FROM public.restaurants WHERE owner_id IS NOT NULL))
   OR store_owner_id IN (SELECT owner_id FROM public.restaurants WHERE LOWER(name) LIKE '%loja cadastrada%');

-- 3. Desvincular/excluir códigos de crédito associados a 'Loja Cadastrada'
DELETE FROM public.credit_codes
WHERE (used_by IS NOT NULL AND used_by NOT IN (SELECT owner_id FROM public.restaurants WHERE owner_id IS NOT NULL))
   OR used_by IN (SELECT owner_id FROM public.restaurants WHERE LOWER(name) LIKE '%loja cadastrada%')
   OR assigned_to_user_id IN (SELECT owner_id FROM public.restaurants WHERE LOWER(name) LIKE '%loja cadastrada%');

-- 4. Excluir definitivamente qualquer restaurante cadastrado com o nome 'Loja Cadastrada'
DELETE FROM public.restaurants
WHERE LOWER(name) LIKE '%loja cadastrada%';

-- 5. Função RPC executável pelo backend/admin para expurgar órfãos de 'Loja Cadastrada' sob demanda
CREATE OR REPLACE FUNCTION public.admin_clean_loja_cadastrada_orphans()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_credits INT := 0;
  v_deleted_recharges INT := 0;
  v_deleted_restaurants INT := 0;
BEGIN
  -- Remover créditos de lojas que não possuem cadastro ativo em restaurants
  DELETE FROM public.store_credits
  WHERE user_id NOT IN (SELECT owner_id FROM public.restaurants WHERE owner_id IS NOT NULL)
     OR user_id IN (SELECT owner_id FROM public.restaurants WHERE LOWER(name) LIKE '%loja cadastrada%');
  GET DIAGNOSTICS v_deleted_credits = ROW_COUNT;

  -- Remover recargas de lojas inexistentes
  DELETE FROM public.store_recharges
  WHERE (store_owner_id IS NOT NULL AND store_owner_id NOT IN (SELECT owner_id FROM public.restaurants WHERE owner_id IS NOT NULL))
     OR store_owner_id IN (SELECT owner_id FROM public.restaurants WHERE LOWER(name) LIKE '%loja cadastrada%');
  GET DIAGNOSTICS v_deleted_recharges = ROW_COUNT;

  -- Deletar restaurantes com o nome genérico 'Loja Cadastrada'
  DELETE FROM public.restaurants
  WHERE LOWER(name) LIKE '%loja cadastrada%';
  GET DIAGNOSTICS v_deleted_restaurants = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_credits', v_deleted_credits,
    'deleted_recharges', v_deleted_recharges,
    'deleted_restaurants', v_deleted_restaurants
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clean_loja_cadastrada_orphans() TO authenticated, service_role;
