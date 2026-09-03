
-- Phase 4: Safe financial cleanup with audit log
CREATE TABLE IF NOT EXISTS public.financial_cleanup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  from_date timestamptz,
  to_date timestamptz,
  deleted_earnings int NOT NULL DEFAULT 0,
  deleted_withdrawals int NOT NULL DEFAULT 0,
  deleted_delivered_requests int NOT NULL DEFAULT 0,
  deleted_delivered_orders int NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_cleanup_logs TO authenticated;
GRANT ALL ON public.financial_cleanup_logs TO service_role;

ALTER TABLE public.financial_cleanup_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view financial cleanup logs" ON public.financial_cleanup_logs;
CREATE POLICY "Admins view financial cleanup logs"
  ON public.financial_cleanup_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Atomic cleanup RPC
CREATE OR REPLACE FUNCTION public.admin_cleanup_financials(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_withdrawals boolean DEFAULT true,
  p_include_earnings boolean DEFAULT true,
  p_include_delivered_requests boolean DEFAULT true,
  p_include_delivered_orders boolean DEFAULT true,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_from timestamptz := COALESCE(p_from, '1970-01-01'::timestamptz);
  v_to   timestamptz := COALESCE(p_to,   now() + interval '1 day');
  v_earn int := 0; v_with int := 0; v_req int := 0; v_ord int := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar a limpeza';
  END IF;

  -- Delete delivered orders first to release FK to delivery_requests
  IF p_include_delivered_orders THEN
    WITH del AS (
      DELETE FROM public.orders
       WHERE status = 'delivered'
         AND created_at >= v_from AND created_at < v_to
      RETURNING 1
    ) SELECT count(*) INTO v_ord FROM del;
  END IF;

  IF p_include_delivered_requests THEN
    WITH del AS (
      DELETE FROM public.delivery_requests
       WHERE status = 'delivered'
         AND created_at >= v_from AND created_at < v_to
      RETURNING 1
    ) SELECT count(*) INTO v_req FROM del;
  END IF;

  IF p_include_earnings THEN
    WITH del AS (
      DELETE FROM public.driver_earnings
       WHERE created_at >= v_from AND created_at < v_to
      RETURNING 1
    ) SELECT count(*) INTO v_earn FROM del;
  END IF;

  IF p_include_withdrawals THEN
    WITH del AS (
      DELETE FROM public.withdrawal_requests
       WHERE created_at >= v_from AND created_at < v_to
      RETURNING 1
    ) SELECT count(*) INTO v_with FROM del;
  END IF;

  INSERT INTO public.financial_cleanup_logs (
    admin_user_id, from_date, to_date,
    deleted_earnings, deleted_withdrawals,
    deleted_delivered_requests, deleted_delivered_orders,
    reason
  ) VALUES (
    v_caller, p_from, p_to,
    v_earn, v_with, v_req, v_ord, p_reason
  );

  RETURN jsonb_build_object(
    'deleted_earnings', v_earn,
    'deleted_withdrawals', v_with,
    'deleted_delivered_requests', v_req,
    'deleted_delivered_orders', v_ord,
    'total', v_earn + v_with + v_req + v_ord
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cleanup_financials(timestamptz, timestamptz, boolean, boolean, boolean, boolean, text) TO authenticated;
