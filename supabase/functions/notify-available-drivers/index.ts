import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  fetchActiveSubscriptions,
  fetchOnlineDrivers,
  getCaller,
  groupByPlatform,
  serviceClient,
} from "../_shared/push-db.ts";
import {
  buildPayload,
  humanize,
  isRetryable,
  loadConfig,
  PushError,
  sendNotification,
  type SendResult,
} from "../_shared/onesignal.ts";

const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://duarteentregas.lovable.app";
const RETRY_DELAYS = [0, 15000, 60000];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const svc = serviceClient();

  try {
    const caller = await getCaller(req);
    if (!caller) {
      return jsonResponse({ success: false, code: "NAO_AUTENTICADO", message: humanize("NAO_AUTENTICADO"), request_id: requestId }, 200);
    }

    const body = await req.json().catch(() => ({}));
    const pedidoId: string | undefined = body?.pedido_id;
    if (!pedidoId) {
      return jsonResponse({ success: false, code: "PARAMETRO_INVALIDO", message: "Informe pedido_id.", request_id: requestId }, 200);
    }

    const cfg = loadConfig();

    // Pedido ainda disponível?
    const available = await isAvailable(svc, pedidoId);
    if (!available) {
      return jsonResponse({ success: false, code: "PEDIDO_INDISPONIVEL", message: humanize("PEDIDO_INDISPONIVEL"), request_id: requestId });
    }

    // Idempotência
    const eventKey = `nova_entrega:${pedidoId}`;
    const { data: job, error: jobErr } = await svc
      .from("notification_jobs")
      .insert({ event_key: eventKey, pedido_id: pedidoId, event_type: "nova_entrega", status: "processing", attempts: 1 })
      .select()
      .maybeSingle();

    if (jobErr) {
      // already exists => já disparado
      return jsonResponse({ success: true, duplicated: true, code: "JA_ENVIADO", message: "Notificação deste pedido já foi disparada.", request_id: requestId });
    }

    const drivers = await fetchOnlineDrivers(svc);
    if (drivers.length === 0) {
      await finishJob(svc, job!.id, "no_recipients", 0, null, "SEM_MOTORISTAS_ONLINE");
      await log(svc, { pedidoId, requestId, requested: 0, found: 0, errorCode: "SEM_MOTORISTAS_ONLINE" });
      return jsonResponse({ success: false, code: "SEM_MOTORISTAS_ONLINE", message: humanize("SEM_MOTORISTAS_ONLINE"), drivers_online: 0, request_id: requestId });
    }

    const subs = await fetchActiveSubscriptions(svc, drivers.map((d) => d.user_id));
    if (subs.length === 0) {
      await finishJob(svc, job!.id, "no_recipients", 0, null, "SEM_INSCRICOES");
      await log(svc, { pedidoId, requestId, requested: 0, found: 0, errorCode: "SEM_INSCRICOES" });
      return jsonResponse({ success: false, code: "SEM_INSCRICOES", message: humanize("SEM_INSCRICOES"), drivers_online: drivers.length, request_id: requestId });
    }

    const groups = groupByPlatform(subs);
    const results: SendResult[] = [];

    for (const [platform, ids] of Object.entries(groups)) {
      const payload = buildPayload({
        appId: cfg.appId,
        subscriptionIds: ids,
        platform,
        headings: { pt: "🚚 Nova entrega disponível", en: "New delivery available" },
        contents: {
          pt: "Um lojista solicitou um motorista. Toque para visualizar.",
          en: "A merchant requested a driver. Tap to view.",
        },
        data: { tipo: "nova_entrega", pedido_id: pedidoId, rota: `/entregador?pedido=${pedidoId}`, evento_id: `nova_entrega:${pedidoId}` },
        url: `${APP_BASE_URL}/entregador?pedido=${pedidoId}`,
        ttl: 300,
        buttonLabel: "Ver entrega",
      });

      let result = await sendNotification(cfg, payload, platform);
      for (let attempt = 1; attempt < RETRY_DELAYS.length && !result.ok && isRetryable(result); attempt++) {
        if (!(await isAvailable(svc, pedidoId))) break;
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        result = await sendNotification(cfg, payload, platform);
      }
      results.push(result);
      await log(svc, {
        pedidoId,
        requestId,
        requested: result.requested,
        found: result.recipients ?? 0,
        notificationId: result.notification_id,
        status: result.status,
        raw: result.raw,
        errorCode: result.error_code,
        platform,
      });
    }

    const anyOk = results.some((r) => r.ok);
    const totalRecipients = results.reduce((s, r) => s + (r.recipients ?? 0), 0);
    await finishJob(
      svc,
      job!.id,
      anyOk ? "sent" : "failed",
      totalRecipients,
      results.find((r) => r.notification_id)?.notification_id ?? null,
      anyOk ? null : results.map((r) => `${r.platform}:${r.error_code}`).join(", "),
    );

    return jsonResponse({
      success: anyOk,
      code: anyOk ? undefined : results[0]?.error_code,
      message: anyOk
        ? `Notificação enviada para ${totalRecipients} dispositivo(s).`
        : humanize(results[0]?.error_code),
      request_id: requestId,
      drivers_online: drivers.length,
      subscriptions_found: subs.length,
      recipients: totalRecipients,
      results: results.map((r) => ({
        platform: r.platform,
        requested: r.requested,
        recipients: r.recipients,
        http_status: r.status,
        notification_id: r.notification_id ? `***${r.notification_id.slice(-8)}` : null,
        error_code: r.error_code,
        error_message: r.error_message,
      })),
    });
  } catch (err) {
    const pe = err instanceof PushError ? err : null;
    const code = pe?.code ?? "ERRO_INTERNO";
    return jsonResponse({
      success: false,
      code,
      message: pe?.message ?? humanize(code),
      detail: err instanceof Error ? err.message : String(err),
      request_id: requestId,
    }, 200);
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
  lastError: string | null,
) {
  await svc.from("notification_jobs").update({
    status,
    recipients_count: recipients,
    onesignal_notification_id: notificationId,
    last_error: lastError,
    processed_at: new Date().toISOString(),
  }).eq("id", id);
}

async function log(svc: ReturnType<typeof serviceClient>, o: {
  pedidoId: string; requestId: string; requested: number; found: number;
  notificationId?: string; status?: number; raw?: string; errorCode?: string; platform?: string;
}) {
  await svc.from("notification_delivery_logs").insert({
    pedido_id: o.pedidoId,
    event_type: "nova_entrega",
    request_id: o.requestId,
    recipients_requested: o.requested,
    recipients_found: o.found,
    onesignal_notification_id: o.notificationId ? `***${o.notificationId.slice(-8)}` : null,
    response_status: o.status ?? null,
    response_body_sanitized: o.raw ?? null,
    error_code: o.errorCode ?? null,
    platform: o.platform ?? null,
  });
}
