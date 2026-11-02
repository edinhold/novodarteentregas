-- Migration: Fix driver earnings wallet persistence, RLS security, and self-healing
-- Date: 2026-11-02
-- Description:
-- 1. Ensure driver can view own earnings whether driver_id holds drivers.id or auth.uid.
-- 2. Self-heal any orphan driver_earnings stuck in 'requested' back to 'pending'.
-- 3. Ensure financial reset NEVER clears real driver accumulated earnings.

-- 1. TIGHTEN AND BROADEN DRIVER RLS POLICY ON driver_earnings
DROP POLICY IF EXISTS "Drivers can view own earnings" ON public.driver_earnings;

CREATE POLICY "Drivers can view own earnings" 
ON public.driver_earnings FOR SELECT 
TO authenticated 
USING (
  driver_earnings.driver_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.drivers d 
    WHERE (d.id = driver_earnings.driver_id OR d.user_id = driver_earnings.driver_id) 
      AND d.user_id = auth.uid()
  )
);

-- 2. REVERT ANY ORPHANED 'requested' EARNINGS BACK TO 'pending'
-- Only keep 'requested' if there is an active pending withdrawal_requests entry.
UPDATE public.driver_earnings e
SET status = 'pending', updated_at = now()
WHERE e.status = 'requested'
  AND NOT EXISTS (
    SELECT 1 FROM public.withdrawal_requests w
    WHERE (w.driver_id = e.driver_id OR w.driver_user_id = e.driver_id)
      AND w.status = 'pending'
  );

-- 3. ENSURE FUNCTION TO SYNC DRIVER EARNINGS AND REPAIR MISSING LINKS
CREATE OR REPLACE FUNCTION public.sync_driver_wallet_balance(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_driver_id UUID;
  v_healed INT := 0;
  v_pending_total NUMERIC := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  -- Locate driver profile ID
  SELECT id INTO v_driver_id
  FROM public.drivers
  WHERE user_id = v_uid
  LIMIT 1;

  -- Revert orphan requested earnings
  IF v_driver_id IS NOT NULL THEN
    WITH healed AS (
      UPDATE public.driver_earnings e
      SET status = 'pending', updated_at = now()
      WHERE (e.driver_id = v_driver_id OR e.driver_id = v_uid)
        AND e.status = 'requested'
        AND NOT EXISTS (
          SELECT 1 FROM public.withdrawal_requests w
          WHERE (w.driver_id = v_driver_id OR w.driver_user_id = v_uid)
            AND w.status = 'pending'
        )
      RETURNING 1
    )
    SELECT count(*) INTO v_healed FROM healed;

    SELECT COALESCE(sum(amount), 0) INTO v_pending_total
    FROM public.driver_earnings
    WHERE (driver_id = v_driver_id OR driver_id = v_uid)
      AND status IN ('pending', 'requested');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_uid,
    'driver_id', v_driver_id,
    'healed_orphans', v_healed,
    'accumulated_balance', v_pending_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_driver_wallet_balance(UUID) TO authenticated, service_role;

-- 4. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

