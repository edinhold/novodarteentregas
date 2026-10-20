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
  applyAndroidChannel,
} from "../_shared/onesignal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const svc = serviceClient();

  try {
    const caller = await getCaller(req);
    const authHeader = req.headers.get("Authorization") || "";
    const isServiceOrAnon = authHeader.includes("Bearer ") || authHeader.includes("sb_publishable_");

    if (!caller && !isServiceOrAnon) {
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

    // 3. Obter total de motoristas cadastrados
    const { count: totalDriversCount } = await svc
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    // 4. Envio real REST OneSignal para TODOS os motoristas cadastrados
    const cfg = loadConfig();
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://duarteentregas.vercel.app";

    const payload: Record<string, any> = {
      app_id: cfg.appId,
      target_channel: "push",
      included_segments: ["Total Subscriptions"],
      headings: { pt: "🚚 Nova entrega disponível!", en: "New delivery available!" },
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
      android_visibility: 1,
      android_sound: "notification_sound",
      android_accent_color: "FFF97316",
    };
    applyAndroidChannel(payload);

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
      requested: totalDriversCount || 1,
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
          ? `Notificação enviada via OneSignal para todos os motoristas cadastrados (${osResult.recipients} dispositivo(s)).`
          : `OneSignal recusou envio: ${osResult.error_message || osResult.error_code}`,
        request_id: requestId,
        total_drivers: totalDriversCount || 0,
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
    .select("id, status")
    .eq("id", pedidoId)
    .maybeSingle();
  return !!data && data.status === "pending";
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
