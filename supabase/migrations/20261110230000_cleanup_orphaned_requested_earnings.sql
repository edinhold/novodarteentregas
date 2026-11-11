-- Migration: Reconcile orphaned driver earnings stuck in 'requested' status
-- Ensures that driver balances are never locked in 'requested' if there is no open pending withdrawal request

DO $$
BEGIN
  -- Reverte ganhos órfãos com status 'requested' para 'pending' caso não haja solicitação de saque 'pending'
  UPDATE public.driver_earnings de
  SET status = 'pending', updated_at = now()
  WHERE de.status = 'requested'
    AND NOT EXISTS (
      SELECT 1 
      FROM public.withdrawal_requests wr
      JOIN public.drivers d ON (d.id = wr.driver_id OR d.user_id = wr.driver_user_id)
      WHERE (d.id = de.driver_id OR d.user_id = de.driver_id)
        AND wr.status = 'pending'
    );
END $$;

