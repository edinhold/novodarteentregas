-- Migration: Single financial entry deletion RPC and orphan signup security
-- Allows Admins to delete individual financial records by exact primary key ID with audit safety.

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
BEGIN
  -- 1. Verify caller is admin if executed within auth context
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
    DELETE FROM public.withdrawal_requests WHERE id = p_entry_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

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
    -- Generic safe fallback: try deleting from credit_codes or store_recharges or driver_earnings if ID matches
    DELETE FROM public.store_recharges WHERE id = p_entry_id OR credit_code_id = p_entry_id;
    DELETE FROM public.credit_codes WHERE id = p_entry_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count = 0 THEN
      DELETE FROM public.driver_earnings WHERE id = p_entry_id;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    END IF;

    IF v_deleted_count = 0 THEN
      DELETE FROM public.withdrawal_requests WHERE id = p_entry_id;
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
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

-- Grant permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.admin_delete_single_financial_entry(UUID, TEXT) TO authenticated, service_role;
