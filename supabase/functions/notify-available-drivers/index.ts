import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  fetchActiveSubscriptions,
  fetchOnlineDrivers,
  getCaller,
  serviceClient,
} from "../_shared/push-db.ts";
import {
  humanize,
  loadConfig,
  mask,
  sendNotification,
} from "../_shared/onesignal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const svc = serviceClient();

  try {
    const caller = await getCaller(req);
    if (!caller) {
      return jsonResponse(
        { success: false, code: "NAO_AUTENTICADO", message: humanize("NAO_AUTENTICADO"), request_id: requestId },
        200
      );
    }

    const body = await req.json().catch(() => ({}));
    const pedidoId: string | undefined = body?.pedido_id;
    if (!pedidoId) {
      return jsonResponse(
        { success: false, code: "PARAMETRO_INVALIDO", message: "Informe pedido_id.", request_id: requestId },
        200
      );
    }

    // 1. Pedido ainda disponível?
    const available = await isAvailable(svc, pedidoId);
    if (!available) {
      return jsonResponse(
        { success: false, code: "PEDIDO_INDISPONIVEL", message: humanize("PEDIDO_INDISPONIVEL"), request_id: requestId },
        200
      );
    }

    // 2. Idempotência
    const eventKey = `nova_entrega:${pedidoId}`;
    const { data: job, error: jobErr } = await svc
      .from("notification_jobs")
      .insert({ event_key: eventKey, pedido_id: pedidoId, event_type: "nova_entrega", status: "processing", attempts: 1 })
      .select()
      .maybeSingle();

    if (jobErr) {
      return jsonResponse(
        { success: true, duplicated: true, code: "JA_ENVIADO", message: "Notificação deste pedido já foi disparada.", request_id: requestId },
        200
      );
    }

    // 3. Motoristas online elegíveis
    const drivers = await fetchOnlineDrivers(svc);
    if (drivers.length === 0) {
      await finishJob(svc, job!.id, "no_recipients", 0, null, "SEM_MOTORISTAS_ONLINE");
      await log(svc, { pedidoId, requestId, requested: 0, found: 0, errorCode: "SEM_MOTORISTAS_ONLINE" });
      return jsonResponse(
        { success: false, code: "SEM_MOTORISTAS_ONLINE", message: humanize("SEM_MOTORISTAS_ONLINE"), drivers_online: 0, request_id: requestId },
        200
      );
    }

    // 4. Inscrições de push ativas (1 por motorista)
    const userIds = drivers.map((d) => d.user_id);
    const subs = await fetchActiveSubscriptions(svc, userIds);

    const subIds = Array.from(new Set(subs.map((s) => s.onesignal_subscription_id))).filter(Boolean);

    if (subIds.length === 0) {
      await finishJob(svc, job!.id, "no_subscriptions", 0, null, "SEM_INSCRICOES");
      await log(svc, { pedidoId, requestId, requested: 0, found: 0, errorCode: "SEM_INSCRICOES" });
      return jsonResponse(
        { success: false, code: "SEM_INSCRICOES", message: humanize("SEM_INSCRICOES"), drivers_online: drivers.length, subscriptions_found: 0, request_id: requestId },
        200
      );
    }

    // 5. Envio real REST OneSignal
    const cfg = loadConfig();
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://duarteentregas.lovable.app";

    const payload = {
      app_id: cfg.appId,
      include_subscription_ids: subIds,
      target_channel: "push",
      headings: { pt: "🚚 Nova entrega disponível", en: "New delivery available" },
      contents: {
        pt: "Um novo chamado de entrega foi criado. Abra o aplicativo para visualizar os detalhes.",
        en: "A merchant requested a driver. Tap to view.",
      },
      data: {
        tipo: "nova_entrega",
        pedido_id: pedidoId,
        rota: `/entregador?pedido=${pedidoId}`,
        evento_id: eventKey,
      },
      url: `${APP_BASE_URL}/entregador?pedido=${pedidoId}`,
      collapse_id: `nova_entrega:${pedidoId}`,
      priority: 10,
      ttl: 300,
      content_available: true,
      android_channel_id: "novas_entregas_v1",
      android_visibility: 1,
      android_sound: "notification_sound",
      android_accent_color: "FFF97316",
    };

    const osResult = await sendNotification(cfg, payload);

    await finishJob(
      svc,
      job!.id,
      osResult.ok ? "sent" : "failed",
      osResult.recipients,
      osResult.notification_id ? mask(osResult.notification_id) : null,
      osResult.error_message
    );

    await log(svc, {
      pedidoId,
      requestId,
      requested: subIds.length,
      found: osResult.recipients,
      notificationId: osResult.notification_id ? mask(osResult.notification_id) : undefined,
      status: osResult.status,
      raw: osResult.raw,
      errorCode: osResult.error_code ?? undefined,
    });

    return jsonResponse(
      {
        success: osResult.ok,
        message: osResult.ok
          ? `Notificação enviada via OneSignal para ${osResult.recipients} motorista(s) elegível(is).`
          : `OneSignal recusou envio: ${osResult.error_message || osResult.error_code}`,
        request_id: requestId,
        drivers_online: drivers.length,
        subscriptions_found: subIds.length,
        recipients_found: osResult.recipients,
        onesignal_notification_id: osResult.notification_id,
      },
      200
    );
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        code: "ERRO_INTERNO",
        message: err?.message || "Falha ao processar disparo de notificação.",
        request_id: requestId,
      },
      200
    );
  }
});

async function isAvailable(svc: ReturnType<typeof serviceClient>, pedidoId: string) {
  const { data } = await svc
    .from("delivery_requests")
    .select("id, status, driver_id")
    .eq("id", pedidoId)
    .maybeSingle();
  return !!data && data.status === "pending" && !data.driver_id;
}

async function finishJob(
  svc: ReturnType<typeof serviceClient>,
  id: string,
  status: string,
  recipients: number,
  notificationId: string | null,
  lastError: string | null
) {
  await svc
    .from("notification_jobs")
    .update({
      status,
      recipients_count: recipients,
      onesignal_notification_id: notificationId,
      last_error: lastError,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function log(
  svc: ReturnType<typeof serviceClient>,
  o: {
    pedidoId: string;
    requestId: string;
    requested: number;
    found: number;
    notificationId?: string;
    status?: number;
    raw?: string;
    errorCode?: string;
    platform?: string;
  }
) {
  await svc.from("notification_delivery_logs").insert({
    pedido_id: o.pedidoId,
    event_type: "nova_entrega",
    request_id: o.requestId,
    recipients_requested: o.requested,
    recipients_found: o.found,
    onesignal_notification_id: o.notificationId ?? null,
    response_status: o.status ?? 200,
    response_body_sanitized: o.raw ?? "sent_onesignal",
    error_code: o.errorCode ?? null,
    platform: o.platform ?? "all",
  });
}
