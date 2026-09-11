-- Migration: Automatic OneSignal Push Notification on Order Creation and Automatic Cancellation on Acceptance

CREATE OR REPLACE FUNCTION public.notify_onesignal_on_new_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url_notify text := 'https://qhlunszfcpzsfjjugkus.supabase.co/functions/v1/notify-available-drivers';
  v_url_cancel text := 'https://qhlunszfcpzsfjjugkus.supabase.co/functions/v1/cancel-delivery-notification';
  v_anon text := 'sb_publishable_xp0FiNgyQFvsdy9SXeGnSA_iUehC_FO';
BEGIN
  -- 1. Disparar notificação OneSignal quando o painel de lojas criar um novo pedido de entrega
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.driver_id IS NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := v_url_notify,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon
        ),
        body := jsonb_build_object('pedido_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Erro ao invocar trigger de notificação pg_net: %', SQLERRM;
    END;
  -- 2. Disparar cancelamento/remoção da notificação OneSignal quando um motorista aceitar ou a corrida for cancelada
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND (NEW.status = 'accepted' OR NEW.status = 'cancelled' OR NEW.driver_id IS NOT NULL) THEN
    BEGIN
      PERFORM net.http_post(
        url := v_url_cancel,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon
        ),
        body := jsonb_build_object('pedido_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Erro ao invocar trigger de cancelamento pg_net: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_onesignal_on_new_request ON public.delivery_requests;
CREATE TRIGGER trg_notify_onesignal_on_new_request
  AFTER INSERT OR UPDATE ON public.delivery_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_onesignal_on_new_request();
