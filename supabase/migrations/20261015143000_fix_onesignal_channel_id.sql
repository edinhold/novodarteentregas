-- Migration: Fix OneSignal channel ID rejection (Could not find android_channel_id)
-- Date: 2026-10-15
-- Description: Removes the hardcoded 'novas_entregas_v1' android_channel_id from pg_net payloads,
-- preventing OneSignal from rejecting notifications when that specific UUID does not exist in the dashboard.

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
  v_user_ids jsonb := '[]'::jsonb;
  v_sub_ids jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_event_key text;
  v_driver_count int := 0;
  v_job_id uuid;
BEGIN
  -- Buscar chave da API na tabela de configuracao ou variaveis do Postgres
  SELECT onesignal_rest_api_key
  INTO v_api_key
  FROM public.app_push_config
  WHERE id = 'default' AND onesignal_rest_api_key IS NOT NULL AND onesignal_rest_api_key != ''
  LIMIT 1;

  IF v_api_key IS NULL THEN
    v_api_key := NULLIF(current_setting('app.settings.onesignal_api_key', true), '');
  END IF;

  -- Verificar se pedido existe e está pendente
  SELECT id, status, driver_id, pickup_address, delivery_address, driver_fee
  INTO v_order
  FROM public.delivery_requests
  WHERE id = p_pedido_id;

  IF NOT FOUND OR v_order.status != 'pending' OR v_order.driver_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PEDIDO_INDISPONIVEL', 'message', 'Pedido já aceito ou indisponível.');
  END IF;

  v_event_key := 'nova_entrega:' || p_pedido_id::text;

  -- Controle de duplicidade (idempotência)
  INSERT INTO public.notification_jobs (event_key, pedido_id, event_type, status, attempts)
  VALUES (v_event_key, p_pedido_id, 'nova_entrega', 'processing', 1)
  ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicated', true, 'code', 'JA_ENVIADO');
  END IF;

  -- Coletar motoristas elegíveis (user_id e subscription_id)
  WITH eligible AS (
    SELECT DISTINCT 
      driver_user_id,
      subscription_id
    FROM public.get_eligible_drivers_for_push()
  )
  SELECT 
    COALESCE(jsonb_agg(DISTINCT driver_user_id::text) FILTER (WHERE driver_user_id IS NOT NULL), '[]'::jsonb),
    COALESCE(jsonb_agg(DISTINCT subscription_id) FILTER (WHERE subscription_id IS NOT NULL AND subscription_id != ''), '[]'::jsonb),
    COUNT(DISTINCT driver_user_id)
  INTO v_user_ids, v_sub_ids, v_driver_count
  FROM eligible;

  -- Construir payload para OneSignal sem android_channel_id inválido
  IF jsonb_array_length(v_user_ids) > 0 OR jsonb_array_length(v_sub_ids) > 0 THEN
    v_payload := jsonb_build_object(
      'app_id', v_app_id,
      'target_channel', 'push',
      'headings', jsonb_build_object(
        'pt', '🚚 Nova entrega disponível!',
        'en', 'New delivery available!'
      ),
      'contents', jsonb_build_object(
        'pt', 'Nova corrida disponível no valor de R$ ' || COALESCE(ROUND(v_order.driver_fee::numeric, 2)::text, '0.00') || '. Toque para abrir.',
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
      'ttl', 300,
      'content_available', true,
      'android_visibility', 1,
      'android_sound', 'notification_sound',
      'android_accent_color', 'FFF97316'
    );

    IF jsonb_array_length(v_user_ids) > 0 THEN
      v_payload := v_payload || jsonb_build_object('include_aliases', jsonb_build_object('external_id', v_user_ids));
    END IF;

    IF jsonb_array_length(v_sub_ids) > 0 THEN
      v_payload := v_payload || jsonb_build_object('include_subscription_ids', v_sub_ids);
    END IF;
  ELSE
    -- Fallback final: envia para todos os motoristas inscritos (Active Subscriptions)
    v_payload := jsonb_build_object(
      'app_id', v_app_id,
      'included_segments', jsonb_build_array('Active Subscriptions'),
      'headings', jsonb_build_object(
        'pt', '🚚 Nova entrega disponível!',
        'en', 'New delivery available!'
      ),
      'contents', jsonb_build_object(
        'pt', 'Um novo chamado de entrega foi criado. Abra o aplicativo para visualizar.',
        'en', 'A merchant requested a driver. Tap to view.'
      ),
      'data', jsonb_build_object(
        'tipo', 'nova_entrega',
        'pedido_id', p_pedido_id,
        'rota', '/entregador?pedido=' || p_pedido_id::text
      ),
      'url', v_app_url || '/entregador?pedido=' || p_pedido_id::text,
      'collapse_id', v_event_key,
      'priority', 10,
      'ttl', 300
    );
  END IF;

  -- Disparo assíncrono direto via extensão pg_net do PostgreSQL
  BEGIN
    PERFORM net.http_post(
      url := v_api_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json; charset=utf-8',
        'Authorization', 'Key ' || v_api_key
      ),
      body := v_payload
    );

    UPDATE public.notification_jobs
    SET status = 'sent',
        recipients_count = v_driver_count,
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
      'nova_entrega_postgres_direct',
      v_driver_count,
      v_driver_count,
      200,
      'Enviado via pg_net direto para OneSignal REST API',
      'all'
    );

    RETURN jsonb_build_object('success', true, 'drivers_notified', v_driver_count);
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
