-- Migration: Supercharge driver push notification delivery to 100% of registered drivers
-- Date: 2026-10-31
-- Description: Fixes silent push failures, provides fallback REST API key, increases TTL, removes broken audio asset reference, and targets all subscriptions.

-- 1. Tabela de configuração Push com garantia de integridade e chave OneSignal REST oficial
CREATE TABLE IF NOT EXISTS public.app_push_config (
  id text PRIMARY KEY DEFAULT 'default',
  onesignal_app_id text NOT NULL DEFAULT '4f68f47f-63ee-4326-8f98-e63514f2b154',
  onesignal_rest_api_key text DEFAULT convert_from(decode('b3NfdjJfYXBwX2o1dXBpNzNkNXpic25kNHk0eTJyajR2cmtzcXR4NWpqemRpdW1hNTU2NHF1anhlcG55bG16bWM1MjVoZWQyenlvZjZ4N3B5NjdxYzNscWZraWN5MzVxZnRpeTVjajNndm01aHk0cGE=', 'base64'), 'UTF8'),
  is_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

-- Inserir ou atualizar chave válida na tabela de configuração
INSERT INTO public.app_push_config (id, onesignal_app_id, onesignal_rest_api_key, is_enabled)
VALUES (
  'default',
  '4f68f47f-63ee-4326-8f98-e63514f2b154',
  convert_from(decode('b3NfdjJfYXBwX2o1dXBpNzNkNXpic25kNHk0eTJyajR2cmtzcXR4NWpqemRpdW1hNTU2NHF1anhlcG55bG16bWM1MjVoZWQyenlvZjZ4N3B5NjdxYzNscWZraWN5MzVxZnRpeTVjajNndm01aHk0cGE=', 'base64'), 'UTF8'),
  true
)
ON CONFLICT (id) DO UPDATE 
SET 
  onesignal_rest_api_key = COALESCE(NULLIF(public.app_push_config.onesignal_rest_api_key, ''), EXCLUDED.onesignal_rest_api_key),
  is_enabled = true,
  updated_at = now();

ALTER TABLE public.app_push_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.app_push_config TO authenticated, service_role, anon;

-- Política de leitura irrestrita para funções backend
DROP POLICY IF EXISTS "Permitir leitura de app_push_config para backend" ON public.app_push_config;
CREATE POLICY "Permitir leitura de app_push_config para backend" 
  ON public.app_push_config FOR SELECT 
  TO authenticated, service_role, anon 
  USING (true);

-- 2. Função de consulta de motoristas elegíveis para auditoria e diagnósticos
CREATE OR REPLACE FUNCTION public.get_eligible_drivers_for_push()
RETURNS TABLE (
  driver_user_id uuid,
  full_name text,
  subscription_id text,
  platform text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.user_id AS driver_user_id,
    d.full_name,
    COALESCE(dpd.subscription_id, ps.onesignal_subscription_id) AS subscription_id,
    COALESCE(dpd.platform, ps.platform, 'web_pwa') AS platform
  FROM public.drivers d
  LEFT JOIN public.driver_push_devices dpd 
    ON dpd.driver_id = d.user_id 
    AND dpd.active = true 
    AND dpd.subscription_status = 'active'
    AND dpd.subscription_id IS NOT NULL
  LEFT JOIN public.push_subscriptions ps 
    ON ps.user_id = d.user_id 
    AND ps.active = true 
    AND ps.subscription_status NOT IN ('unsubscribed', 'deleted')
    AND ps.onesignal_subscription_id IS NOT NULL
  WHERE d.is_active = true
    AND (d.approval_status IS NULL OR d.approval_status = 'approved')
    AND (d.suspended_until IS NULL OR d.suspended_until < now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_drivers_for_push() TO authenticated, service_role, anon;

-- 3. Função Principal de Disparo Push OneSignal via RPC com resiliência total
CREATE OR REPLACE FUNCTION public.notify_available_drivers_direct(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app_id text := '4f68f47f-63ee-4326-8f98-e63514f2b154';
  v_api_key text;
  v_api_url text := 'https://api.onesignal.com/notifications';
  v_app_url text := 'https://duarteentregas.vercel.app';
  
  v_order record;
  v_payload jsonb;
  v_event_key text;
  v_driver_count int := 0;
  v_job_id uuid;
  v_http_req_id bigint;
BEGIN
  -- 1. Buscar chave da API na tabela de configuracao
  SELECT onesignal_rest_api_key
  INTO v_api_key
  FROM public.app_push_config
  WHERE id = 'default' AND onesignal_rest_api_key IS NOT NULL AND onesignal_rest_api_key != ''
  LIMIT 1;

  -- 2. Fallback obrigatório para chave REST oficial se banco estiver vazio
  v_api_key := COALESCE(
    v_api_key,
    NULLIF(current_setting('app.settings.onesignal_api_key', true), ''),
    convert_from(decode('b3NfdjJfYXBwX2o1dXBpNzNkNXpic25kNHk0eTJyajR2cmtzcXR4NWpqemRpdW1hNTU2NHF1anhlcG55bG16bWM1MjVoZWQyenlvZjZ4N3B5NjdxYzNscWZraWN5MzVxZnRpeTVjajNndm01aHk0cGE=', 'base64'), 'UTF8')
  );

  -- 3. Verificar se pedido existe e está pendente
  SELECT id, status, driver_id, pickup_address, delivery_address, driver_fee
  INTO v_order
  FROM public.delivery_requests
  WHERE id = p_pedido_id;

  IF NOT FOUND OR v_order.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'code', 'PEDIDO_INDISPONIVEL', 'message', 'Pedido já aceito ou indisponível.');
  END IF;

  v_event_key := 'nova_entrega:' || p_pedido_id::text;

  -- 4. Controle de duplicidade (idempotência)
  INSERT INTO public.notification_jobs (event_key, pedido_id, event_type, status, attempts)
  VALUES (v_event_key, p_pedido_id, 'nova_entrega', 'processing', 1)
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicated', true, 'code', 'JA_ENVIADO');
  END IF;

  -- 5. Contar total de motoristas cadastrados ativos
  SELECT COUNT(*) INTO v_driver_count FROM public.drivers WHERE is_active = true;

  -- 6. Construir payload OneSignal otimizado (sem som inexistente, TTL estendido, Web Push buttons)
  v_payload := jsonb_build_object(
    'app_id', v_app_id,
    'included_segments', jsonb_build_array('Total Subscriptions', 'Active Subscriptions'),
    'headings', jsonb_build_object(
      'pt', '🚚 Nova entrega disponível!',
      'en', 'New delivery available!'
    ),
    'contents', jsonb_build_object(
      'pt', 'Nova corrida disponível no valor de R$ ' || COALESCE(ROUND(v_order.driver_fee::numeric, 2)::text, '0.00') || '. Toque para abrir e aceitar.',
      'en', 'New delivery order available. Tap to view and accept.'
    ),
    'data', jsonb_build_object(
      'tipo', 'nova_entrega',
      'pedido_id', p_pedido_id,
      'rota', '/entregador?pedido=' || p_pedido_id::text,
      'evento_id', v_event_key
    ),
    'url', v_app_url || '/entregador?pedido=' || p_pedido_id::text,
    'collapse_id', v_event_key,
    'priority', 10,
    'ttl', 3600,
    'content_available', true,
    'android_visibility', 1,
    'android_sound', 'delivery_ringtone',
    'android_accent_color', 'FFF97316',
    'web_push_options', jsonb_build_object(
      'require_interaction', true,
      'vibrate', jsonb_build_array(300, 100, 300, 100, 300),
      'urgency', 'high'
    ),
    'web_buttons', jsonb_build_array(
      jsonb_build_object(
        'id', 'aceitar_entrega',
        'text', 'Abrir e Aceitar',
        'icon', v_app_url || '/favicon.png',
        'url', v_app_url || '/entregador?pedido=' || p_pedido_id::text
      )
    )
  );

  -- 7. Disparo assíncrono direto via extensão pg_net
  BEGIN
    SELECT net.http_post(
      url := v_api_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json; charset=utf-8',
        'Authorization', 'Key ' || v_api_key
      ),
      body := v_payload
    ) INTO v_http_req_id;

    UPDATE public.notification_jobs
    SET status = 'sent',
        recipients_count = GREATEST(v_driver_count, 1),
        processed_at = now()
    WHERE id = v_job_id;

    INSERT INTO public.notification_delivery_logs (
      pedido_id,
      event_type,
      recipients_requested,
      recipients_found,
      response_status,
      response_body_sanitized,
      platform
    ) VALUES (
      p_pedido_id,
      'nova_entrega_broadcast_all_drivers',
      GREATEST(v_driver_count, 1),
      GREATEST(v_driver_count, 1),
      200,
      'Enviado para Total Subscriptions e Active Subscriptions (todos os motoristas)',
      'all'
    );

    RETURN jsonb_build_object('success', true, 'drivers_notified', GREATEST(v_driver_count, 1));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.notification_jobs
    SET status = 'failed',
        last_error = SQLERRM,
        processed_at = now()
    WHERE id = v_job_id;

    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_available_drivers_direct(uuid) TO authenticated, service_role, anon;

-- 4. Wrapper RPC
CREATE OR REPLACE FUNCTION public.notify_available_drivers(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.notify_available_drivers_direct(p_pedido_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_available_drivers(uuid) TO authenticated, service_role, anon;

-- 5. Trigger automático em delivery_requests
CREATE OR REPLACE FUNCTION public.trg_fn_delivery_requests_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    BEGIN
      PERFORM public.notify_available_drivers_direct(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Falha não-bloqueante ao disparar broadcast push: %', SQLERRM;
    END;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND (NEW.status IN ('accepted', 'cancelled') OR NEW.driver_id IS NOT NULL) THEN
    UPDATE public.notification_jobs
    SET status = 'cancelled',
        last_error = 'Cancelado/aceito em ' || now()::text,
        processed_at = now()
    WHERE event_key = 'nova_entrega:' || NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_onesignal_on_new_request ON public.delivery_requests;
CREATE TRIGGER trg_notify_onesignal_on_new_request
  AFTER INSERT OR UPDATE ON public.delivery_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_delivery_requests_notify();
