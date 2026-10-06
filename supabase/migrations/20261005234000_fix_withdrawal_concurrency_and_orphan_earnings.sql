-- Migration: Fix withdrawal race condition concurrency, index safety, and deletion cleanup

-- 1. Create partial unique index to prevent duplicate pending withdrawal requests for the same driver (Concurrency & Anti-double withdrawal guard)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_withdrawal_per_driver 
ON public.withdrawal_requests (driver_id) 
WHERE status = 'pending';

-- 2. Self-healing cleanup: Revert any orphaned driver_earnings stuck in 'requested' back to 'pending' if no corresponding pending withdrawal request exists
UPDATE public.driver_earnings e
SET status = 'pending', updated_at = now()
WHERE e.status = 'requested'
  AND NOT EXISTS (
    SELECT 1 FROM public.withdrawal_requests w
    WHERE w.driver_id = e.driver_id AND w.status = 'pending'
  );

-- 3. Enhance admin_delete_single_financial_entry to handle withdrawal_requests deletion cleanly
CREATE OR REPLACE FUNCTION public.admin_delete_single_financial_entry(
  p_entry_id UUID,
  p_source_table TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_deleted_count INT := 0;
  v_driver_id UUID;
  v_with_status TEXT;
BEGIN
  -- 1. Verify caller is admin
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir registros financeiros.';
  END IF;

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'ID do lançamento é obrigatório.';
  END IF;

  -- 2. Execute deletion strictly by exact ID on specified table
  IF p_source_table = 'credit_codes' THEN
    DELETE FROM public.store_recharges WHERE credit_code_id = p_entry_id;
    DELETE FROM public.credit_codes WHERE id = p_entry_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  ELSIF p_source_table = 'store_recharges' THEN
    DELETE FROM public.store_recharges WHERE id = p_entry_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  ELSIF p_source_table = 'driver_earnings' THEN
    DELETE FROM public.driver_earnings WHERE id = p_entry_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  ELSIF p_source_table = 'withdrawal_requests' THEN
    -- Fetch driver_id and status before deleting request
    SELECT driver_id, status INTO v_driver_id, v_with_status
    FROM public.withdrawal_requests WHERE id = p_entry_id;

    DELETE FROM public.withdrawal_requests WHERE id = p_entry_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- If the deleted request was pending, revert requested earnings back to pending for that driver
    IF v_driver_id IS NOT NULL AND v_with_status = 'pending' THEN
      UPDATE public.driver_earnings
      SET status = 'pending', updated_at = now()
      WHERE driver_id = v_driver_id AND status = 'requested';
    END IF;

  ELSIF p_source_table = 'delivery_requests' THEN
    UPDATE public.driver_earnings SET delivery_request_id = NULL WHERE delivery_request_id = p_entry_id;
    UPDATE public.orders SET delivery_request_id = NULL WHERE delivery_request_id = p_entry_id;
    DELETE FROM public.chat_messages WHERE delivery_request_id = p_entry_id;
    DELETE FROM public.delivery_notification_dispatches WHERE pedido_id = p_entry_id;
    DELETE FROM public.delivery_requests WHERE id = p_entry_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  ELSIF p_source_table = 'financial_adjustment_logs' OR p_source_table = 'financial_cleanup_logs' THEN
    DELETE FROM public.financial_adjustment_logs WHERE id = p_entry_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  ELSE
    -- Generic safe fallback
    DELETE FROM public.store_recharges WHERE id = p_entry_id OR credit_code_id = p_entry_id;
    DELETE FROM public.credit_codes WHERE id = p_entry_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count = 0 THEN
      DELETE FROM public.driver_earnings WHERE id = p_entry_id;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    END IF;

    IF v_deleted_count = 0 THEN
      SELECT driver_id, status INTO v_driver_id, v_with_status
      FROM public.withdrawal_requests WHERE id = p_entry_id;

      DELETE FROM public.withdrawal_requests WHERE id = p_entry_id;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

      IF v_driver_id IS NOT NULL AND v_with_status = 'pending' THEN
        UPDATE public.driver_earnings
        SET status = 'pending', updated_at = now()
        WHERE driver_id = v_driver_id AND status = 'requested';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_entry_id', p_entry_id,
    'source_table', p_source_table,
    'deleted_count', v_deleted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_single_financial_entry(UUID, TEXT) TO authenticated, service_role;
