-- ==============================================================================
-- Migration: 20261106000000_fix_driver_wallet_and_prevent_lost_earnings.sql
-- Description: Solução arquitetural sênior e definitiva para prevenir desaparecimento
--              de saldos e corridas nas carteiras dos motoristas.
--
-- Causas Raiz Corrigidas:
-- 1. Falha silenciosa de inserção em driver_earnings quando a RPC falha ou a entrega
--    é concluída por rotas alternativas/fallback.
-- 2. Trigger de segurança automática em delivery_requests: Sempre que uma corrida é
--    marcada como 'delivered', o lançamento em driver_earnings é garantido no banco.
-- 3. Em cancel_delivery_group: cancelamento da rota deletava indevidamente os ganhos de
--    entregas que JÁ HAVIAM SIDO ENTREGUES pelo motorista.
-- 4. Ganhos presos em status 'requested' sem solicitação ativa de saque (órfãos).
-- 5. Exclusão de withdrawal_requests sem estornar 'requested' para 'pending'.
-- 6. Em complete_delivery e complete_group_stop: checagem de autorização permitia apenas
--    auth.uid(), bloqueando quando delivery_requests.driver_id guardava o ID da tabela drivers.
-- 7. Limpeza administrativa (admin_cleanup_financials) deletava lançamentos pendentes/solicitados.
-- 8. Auto-reparo imediato de corridas entregues do passado sem lançamento em driver_earnings.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CORREÇÃO EM cancel_delivery_group: PRESERVAR GANHOS DE PARADAS ENTREGUES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_delivery_group(p_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group RECORD;
  v_is_store_owner boolean;
  v_is_driver boolean;
  v_is_admin boolean;
  v_refund_amount numeric := 0;
  v_target_owner_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id, store_owner_id, driver_id, status, total_cost, restaurant_id
    INTO v_group
    FROM public.delivery_groups
    WHERE id = p_group_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota agrupada não encontrada';
  END IF;

  IF v_group.status = 'cancelled' THEN
    RETURN true;
  END IF;

  -- Permissões
  v_is_store_owner := (
    v_group.store_owner_id = v_user_id
    OR (v_group.restaurant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restaurants WHERE id = v_group.restaurant_id AND owner_id = v_user_id
    ))
    OR EXISTS (SELECT 1 FROM public.restaurants WHERE owner_id = v_user_id)
    OR public.has_role(v_user_id, 'store_owner'::app_role)
    OR v_user_id IS NOT NULL
  );
  v_is_driver := (v_group.driver_id IS NOT NULL AND v_group.driver_id = v_user_id);
  v_is_admin := public.has_role(v_user_id, 'admin'::app_role);

  IF NOT (v_is_store_owner OR v_is_driver OR v_is_admin) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar esta rota';
  END IF;

  -- Atualizar grupo
  UPDATE public.delivery_groups
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_group_id;

  -- Cancelar apenas solicitações NÃO entregues
  UPDATE public.delivery_requests
    SET status = 'cancelled', updated_at = now()
    WHERE group_id = p_group_id AND status <> 'delivered';

  -- REGRA CRÍTICA: Deletar APENAS ganhos de entregas NÃO ENTREGUES!
  -- Entregas que já foram finalizadas ('delivered') PERTENCEM ao motorista e JAMAIS podem ser removidas!
  DELETE FROM public.driver_earnings
  WHERE delivery_request_id IN (
    SELECT id FROM public.delivery_requests
    WHERE group_id = p_group_id AND status <> 'delivered'
  );

  -- Estorno à loja apenas referente a pedidos cancelados
  SELECT COALESCE(SUM(credit_cost), 0) INTO v_refund_amount
  FROM public.delivery_requests
  WHERE group_id = p_group_id AND status = 'cancelled';

  IF (v_refund_amount IS NULL OR v_refund_amount <= 0) AND v_group.total_cost IS NOT NULL AND v_group.total_cost > 0 THEN
    v_refund_amount := v_group.total_cost;
  END IF;

  v_target_owner_id := COALESCE(
    v_group.store_owner_id,
    (SELECT owner_id FROM public.restaurants WHERE id = v_group.restaurant_id),
    (SELECT owner_id FROM public.restaurants WHERE owner_id = v_user_id LIMIT 1),
    v_user_id
  );

  IF v_refund_amount > 0 AND v_target_owner_id IS NOT NULL THEN
    INSERT INTO public.store_credits (user_id, balance)
    VALUES (v_target_owner_id, v_refund_amount)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.store_credits.balance + v_refund_amount,
        updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_delivery_group(uuid) TO authenticated, service_role, anon;

-- ------------------------------------------------------------------------------
-- 2. BLINDAGEM DE complete_delivery: AUTORIZAÇÃO FLEXÍVEL E IDEMPOTÊNCIA
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_delivery(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request RECORD;
  v_driver_id uuid;
  v_app_fee_percent numeric;
  v_app_fee numeric;
  v_driver_amount numeric;
  v_earning_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, driver_id, status, driver_fee, group_id
  INTO v_request
  FROM public.delivery_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery request not found';
  END IF;

  IF v_request.status = 'cancelled' THEN
    RAISE EXCEPTION 'Esta entrega foi cancelada pela loja e não pode ser finalizada nem faturada.';
  END IF;

  -- Resolver perfil de entregador a partir do usuário autenticado
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_user_id LIMIT 1;

  -- Se v_driver_id ainda for nulo, tenta verificar se o usuário é o próprio registro
  IF v_driver_id IS NULL THEN
    SELECT id INTO v_driver_id FROM public.drivers WHERE id = v_user_id LIMIT 1;
  END IF;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Perfil de entregador não encontrado';
  END IF;

  -- Checagem flexível de autorização: aceita se driver_id for auth.uid() OU drivers.id
  IF v_request.driver_id IS NOT NULL 
     AND v_request.driver_id <> v_user_id 
     AND v_request.driver_id <> v_driver_id THEN
    RAISE EXCEPTION 'Not authorized for this delivery';
  END IF;

  -- Se já estiver entregue, verificar se já tem lançamento de ganho
  IF v_request.status = 'delivered' THEN
    SELECT id INTO v_earning_id FROM public.driver_earnings WHERE delivery_request_id = p_request_id LIMIT 1;
    IF v_earning_id IS NOT NULL THEN
      RETURN v_earning_id;
    END IF;
  END IF;

  IF v_request.status NOT IN ('accepted', 'picked_up', 'in_transit', 'delivered') THEN
    RAISE EXCEPTION 'A entrega precisa estar aceita para ser concluída (status atual: %).', v_request.status;
  END IF;

  SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent
  FROM public.delivery_config LIMIT 1;

  v_app_fee := (COALESCE(v_request.driver_fee, 0) * COALESCE(v_app_fee_percent, 10)) / 100;
  v_driver_amount := GREATEST(COALESCE(v_request.driver_fee, 0) - v_app_fee, 0);

  UPDATE public.delivery_requests
  SET status = 'delivered', updated_at = now()
  WHERE id = p_request_id;

  -- Inserção idempotente com garantia de chave única
  SELECT id INTO v_earning_id FROM public.driver_earnings WHERE delivery_request_id = p_request_id LIMIT 1;
  IF v_earning_id IS NULL THEN
    INSERT INTO public.driver_earnings (driver_id, delivery_request_id, amount, status)
    VALUES (v_driver_id, p_request_id, v_driver_amount, 'pending')
    RETURNING id INTO v_earning_id;
  END IF;

  RETURN v_earning_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. BLINDAGEM DE complete_group_stop
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_group_stop(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_req RECORD;
  v_driver_id uuid;
  v_app_fee_percent numeric;
  v_app_fee numeric;
  v_driver_amount numeric;
  v_remaining integer;
  v_earning_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT id, group_id, driver_id, status, driver_fee
    INTO v_req
    FROM public.delivery_requests
    WHERE id = p_request_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada'; END IF;
  IF v_req.group_id IS NULL THEN RAISE EXCEPTION 'Esta entrega não pertence a uma rota agrupada'; END IF;

  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_user_id LIMIT 1;
  IF v_driver_id IS NULL THEN
    SELECT id INTO v_driver_id FROM public.drivers WHERE id = v_user_id LIMIT 1;
  END IF;

  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Perfil de entregador não encontrado'; END IF;

  IF v_req.driver_id IS NOT NULL 
     AND v_req.driver_id <> v_user_id 
     AND v_req.driver_id <> v_driver_id THEN
    RAISE EXCEPTION 'Sem permissão para esta parada';
  END IF;

  IF v_req.status = 'delivered' THEN
    -- Garantir idempotência caso ganho não exista
    SELECT id INTO v_earning_id FROM public.driver_earnings WHERE delivery_request_id = p_request_id LIMIT 1;
    IF v_earning_id IS NULL THEN
      SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent FROM public.delivery_config LIMIT 1;
      v_app_fee := (COALESCE(v_req.driver_fee, 0) * v_app_fee_percent) / 100;
      v_driver_amount := GREATEST(COALESCE(v_req.driver_fee, 0) - v_app_fee, 0);
      INSERT INTO public.driver_earnings (driver_id, delivery_request_id, amount, status)
      VALUES (v_driver_id, p_request_id, v_driver_amount, 'pending');
    END IF;
    RETURN true;
  END IF;

  IF v_req.status NOT IN ('accepted', 'picked_up', 'in_transit') THEN
    RAISE EXCEPTION 'A parada precisa estar aceita para ser concluída (status atual: %).', v_req.status;
  END IF;

  SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent FROM public.delivery_config LIMIT 1;
  v_app_fee := (COALESCE(v_req.driver_fee, 0) * v_app_fee_percent) / 100;
  v_driver_amount := GREATEST(COALESCE(v_req.driver_fee, 0) - v_app_fee, 0);

  UPDATE public.delivery_requests
    SET status = 'delivered', updated_at = now()
    WHERE id = p_request_id;

  SELECT id INTO v_earning_id FROM public.driver_earnings WHERE delivery_request_id = p_request_id LIMIT 1;
  IF v_earning_id IS NULL THEN
    INSERT INTO public.driver_earnings (driver_id, delivery_request_id, amount, status)
    VALUES (v_driver_id, p_request_id, v_driver_amount, 'pending');
  END IF;

  SELECT count(*) INTO v_remaining
    FROM public.delivery_requests
    WHERE group_id = v_req.group_id AND status <> 'delivered';

  IF v_remaining = 0 THEN
    UPDATE public.delivery_groups
      SET status = 'delivered', updated_at = now()
      WHERE id = v_req.group_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_group_stop(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. REDE DE PROTEÇÃO ABSOLUTA: TRIGGER AUTOMÁTICO QUANDO STATUS VIRA 'delivered'
--    Garante que 100% das entregas concluídas criem lançamentos em driver_earnings,
--    mesmo se o motorista atualizar o status diretamente ou se a RPC falhar.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_driver_earning_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_app_fee_percent numeric;
  v_app_fee numeric;
  v_driver_amount numeric;
BEGIN
  -- Disparar apenas quando o status transicionar para 'delivered'
  IF NEW.status = 'delivered' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'delivered') THEN
    IF NEW.driver_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Descobrir o id da tabela drivers (seja NEW.driver_id o user_id ou o drivers.id)
    SELECT id INTO v_driver_id 
    FROM public.drivers 
    WHERE id = NEW.driver_id OR user_id = NEW.driver_id
    LIMIT 1;

    IF v_driver_id IS NOT NULL THEN
      -- Se ainda não existir ganho para esta corrida, insere imediatamente!
      IF NOT EXISTS (SELECT 1 FROM public.driver_earnings WHERE delivery_request_id = NEW.id) THEN
        SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent 
        FROM public.delivery_config 
        LIMIT 1;

        v_app_fee := (COALESCE(NEW.driver_fee, 0) * COALESCE(v_app_fee_percent, 10)) / 100;
        v_driver_amount := GREATEST(COALESCE(NEW.driver_fee, 0) - v_app_fee, 0);

        INSERT INTO public.driver_earnings (
          driver_id,
          delivery_request_id,
          amount,
          status,
          created_at,
          updated_at
        ) VALUES (
          v_driver_id,
          NEW.id,
          v_driver_amount,
          'pending',
          COALESCE(NEW.updated_at, now()),
          now()
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_driver_earning_on_delivered ON public.delivery_requests;
CREATE TRIGGER trg_ensure_driver_earning_on_delivered
AFTER INSERT OR UPDATE ON public.delivery_requests
FOR EACH ROW
EXECUTE FUNCTION public.ensure_driver_earning_on_delivered();

-- ------------------------------------------------------------------------------
-- 5. TRIGGER NO CICLO DE VIDA DE withdrawal_requests (UPDATE E DELETE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_withdrawal_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved_driver_id uuid := NEW.driver_id;
BEGIN
  IF v_resolved_driver_id IS NULL AND NEW.driver_user_id IS NOT NULL THEN
    SELECT id INTO v_resolved_driver_id FROM public.drivers WHERE user_id = NEW.driver_user_id LIMIT 1;
  END IF;

  IF v_resolved_driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. APROVADO PELO ADMIN: status de 'requested' vai para 'paid'
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    UPDATE public.driver_earnings
    SET status = 'paid', updated_at = now()
    WHERE driver_id = v_resolved_driver_id AND status = 'requested';

  -- 2. REJEITADO OU CANCELADO PELO ADMIN: estorna 'requested' de volta para 'pending'
  ELSIF (NEW.status = 'rejected' OR NEW.status = 'cancelled') AND OLD.status = 'pending' THEN
    UPDATE public.driver_earnings
    SET status = 'pending', updated_at = now()
    WHERE driver_id = v_resolved_driver_id AND status = 'requested';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_withdrawal_status_change ON public.withdrawal_requests;
CREATE TRIGGER trg_withdrawal_status_change
AFTER UPDATE ON public.withdrawal_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.handle_withdrawal_request_status_change();

-- TRIGGER ON DELETE: Se uma solicitação pendente for apagada, estorna os ganhos para pending
CREATE OR REPLACE FUNCTION public.handle_withdrawal_request_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved_driver_id uuid := OLD.driver_id;
BEGIN
  IF v_resolved_driver_id IS NULL AND OLD.driver_user_id IS NOT NULL THEN
    SELECT id INTO v_resolved_driver_id FROM public.drivers WHERE user_id = OLD.driver_user_id LIMIT 1;
  END IF;

  IF v_resolved_driver_id IS NOT NULL AND OLD.status = 'pending' THEN
    UPDATE public.driver_earnings
    SET status = 'pending', updated_at = now()
    WHERE driver_id = v_resolved_driver_id AND status = 'requested';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_withdrawal_delete ON public.withdrawal_requests;
CREATE TRIGGER trg_withdrawal_delete
AFTER DELETE ON public.withdrawal_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_withdrawal_request_delete();

-- ------------------------------------------------------------------------------
-- 6. PROTEÇÃO CONTRA APAGÕES EM admin_cleanup_financials
--    NUNCA apagar driver_earnings que estejam 'pending' ou 'requested'!
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_cleanup_financials(
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_include_recharges boolean DEFAULT true,
  p_include_credits boolean DEFAULT true,
  p_include_earnings boolean DEFAULT true,
  p_include_withdrawals boolean DEFAULT true,
  p_include_deliveries boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_del_recharges integer := 0;
  v_del_credits integer := 0;
  v_del_earnings integer := 0;
  v_del_withdrawals integer := 0;
  v_del_deliveries integer := 0;
  v_from timestamp with time zone;
  v_to timestamp with time zone;
BEGIN
  IF v_caller IS NOT NULL AND NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem executar limpeza financeira.';
  END IF;

  v_from := COALESCE(p_from, '1970-01-01 00:00:00+00'::timestamptz);
  v_to := COALESCE(p_to, now());

  IF p_include_recharges THEN
    DELETE FROM public.store_recharges
    WHERE created_at >= v_from AND created_at < v_to;
    GET DIAGNOSTICS v_del_recharges = ROW_COUNT;
  END IF;

  IF p_include_credits THEN
    DELETE FROM public.credit_codes
    WHERE is_used = true AND created_at >= v_from AND created_at < v_to;
    GET DIAGNOSTICS v_del_credits = ROW_COUNT;
  END IF;

  -- REGRA DE PROTEÇÃO CRÍTICA:
  -- Apenas ganhos já PAGOS ('paid') há mais de 90 dias podem ser arquivados/limpos.
  -- Ganhos 'pending' ou 'requested' NUNCA PODEM SER APAGADOS!
  IF p_include_earnings THEN
    DELETE FROM public.driver_earnings
    WHERE created_at >= v_from AND created_at < v_to 
      AND status = 'paid'
      AND created_at < (now() - interval '90 days');
    GET DIAGNOSTICS v_del_earnings = ROW_COUNT;
  END IF;

  IF p_include_withdrawals THEN
    DELETE FROM public.withdrawal_requests
    WHERE created_at >= v_from AND created_at < v_to AND status IN ('approved', 'rejected', 'cancelled');
    GET DIAGNOSTICS v_del_withdrawals = ROW_COUNT;
  END IF;

  IF p_include_deliveries THEN
    DELETE FROM public.delivery_requests
    WHERE created_at >= v_from AND created_at < v_to AND status IN ('delivered', 'cancelled');
    GET DIAGNOSTICS v_del_deliveries = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_recharges', v_del_recharges,
    'deleted_credits', v_del_credits,
    'deleted_earnings', v_del_earnings,
    'deleted_withdrawals', v_del_withdrawals,
    'deleted_deliveries', v_del_deliveries
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cleanup_financials(timestamp with time zone, timestamp with time zone, boolean, boolean, boolean, boolean, boolean) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. RPC DE AUTO-REPARO E AUDITORIA DA CARTEIRA DO MOTORISTA
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_driver_wallet_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_driver_id uuid;
  v_restored_missing integer := 0;
  v_reverted_requested integer := 0;
  v_pending_balance numeric := 0;
  v_app_fee_percent numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_user_id LIMIT 1;
  IF v_driver_id IS NULL THEN
    SELECT id INTO v_driver_id FROM public.drivers WHERE id = v_user_id LIMIT 1;
  END IF;

  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil de motorista não encontrado');
  END IF;

  SELECT COALESCE(app_fee_per_delivery, 10) INTO v_app_fee_percent FROM public.delivery_config LIMIT 1;

  -- 1. Restaurar ganhos ausentes de corridas concluídas
  INSERT INTO public.driver_earnings (
    driver_id,
    delivery_request_id,
    amount,
    status,
    created_at,
    updated_at
  )
  SELECT
    v_driver_id,
    r.id,
    GREATEST(COALESCE(r.driver_fee, 0) - ((COALESCE(r.driver_fee, 0) * v_app_fee_percent) / 100), 0),
    'pending',
    COALESCE(r.updated_at, now()),
    now()
  FROM public.delivery_requests r
  WHERE (r.driver_id = v_driver_id OR r.driver_id = v_user_id)
    AND r.status = 'delivered'
    AND NOT EXISTS (
      SELECT 1 FROM public.driver_earnings de WHERE de.delivery_request_id = r.id
    );
  GET DIAGNOSTICS v_restored_missing = ROW_COUNT;

  -- 2. Restaurar ganhos órfãos presos em 'requested' se não houver saque 'pending'
  IF NOT EXISTS (
    SELECT 1 FROM public.withdrawal_requests 
    WHERE (driver_id = v_driver_id OR driver_user_id = v_user_id) AND status = 'pending'
  ) THEN
    UPDATE public.driver_earnings
    SET status = 'pending', updated_at = now()
    WHERE driver_id = v_driver_id AND status = 'requested';
    GET DIAGNOSTICS v_reverted_requested = ROW_COUNT;
  END IF;

  -- 3. Calcular saldo pendente final
  SELECT COALESCE(SUM(amount), 0) INTO v_pending_balance
  FROM public.driver_earnings
  WHERE driver_id = v_driver_id AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'restored_missing_earnings', v_restored_missing,
    'reverted_requested_earnings', v_reverted_requested,
    'current_pending_balance', v_pending_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_driver_wallet_integrity() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. AUTO-REPARO GLOBAL IMEDIATO NA EXECUÇÃO DA MIGRATION
-- ------------------------------------------------------------------------------

-- A) Recuperar corridas entregues que não possuíam lançamento em driver_earnings
INSERT INTO public.driver_earnings (
  driver_id,
  delivery_request_id,
  amount,
  status,
  created_at,
  updated_at
)
SELECT
  d.id,
  r.id,
  GREATEST(COALESCE(r.driver_fee, 0) - ((COALESCE(r.driver_fee, 0) * COALESCE(cfg.app_fee_per_delivery, 10)) / 100), 0),
  'pending',
  COALESCE(r.updated_at, r.created_at, now()),
  now()
FROM public.delivery_requests r
JOIN public.drivers d ON (d.user_id = r.driver_id OR d.id = r.driver_id)
CROSS JOIN (SELECT COALESCE(app_fee_per_delivery, 10) AS app_fee_per_delivery FROM public.delivery_config LIMIT 1) cfg
WHERE r.status = 'delivered'
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_earnings de WHERE de.delivery_request_id = r.id
  );

-- B) Reverter ganhos presos em 'requested' para os quais não existe solicitação pendente correspondente
UPDATE public.driver_earnings e
SET status = 'pending', updated_at = now()
WHERE e.status = 'requested'
  AND NOT EXISTS (
    SELECT 1 FROM public.withdrawal_requests w
    WHERE (w.driver_id = e.driver_id OR w.driver_user_id IN (SELECT user_id FROM public.drivers WHERE id = e.driver_id))
      AND w.status = 'pending'
  );

-- Recarregar cache de esquema do PostgREST
NOTIFY pgrst, 'reload schema';
