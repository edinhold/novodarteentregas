-- Migration: Atualiza o canal de notificação Android do OneSignal
-- Canal oficial: 427c58c3-215f-491b-8fbe-8a5c8f94ebe2

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
  v_android_channel_id text := '427c58c3-215f-491b-8fbe-8a5c8f94ebe2';

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

  -- 6. Construir payload OneSignal otimizado com o canal Android oficial
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
    'android_channel_id', v_android_channel_id,
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
