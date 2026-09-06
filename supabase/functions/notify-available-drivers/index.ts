import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  fetchActiveSubscriptions,
  fetchOnlineDrivers,
  getCaller,
  serviceClient,
} from "../_shared/push-db.ts";
import {
  humanize,
  PushError,
} from "../_shared/onesignal.ts";

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
      return jsonResponse({ success: true, duplicated: true, code: "JA_ENVIADO", message: "Notificação deste pedido já foi disparada.", request_id: requestId });
    }

    const drivers = await fetchOnlineDrivers(svc);
    if (drivers.length === 0) {
      await finishJob(svc, job!.id, "no_recipients", 0, null, "SEM_MOTORISTAS_ONLINE");
      await log(svc, { pedidoId, requestId, requested: 0, found: 0, errorCode: "SEM_MOTORISTAS_ONLINE" });
      return jsonResponse({ success: false, code: "SEM_MOTORISTAS_ONLINE", message: humanize("SEM_MOTORISTAS_ONLINE"), drivers_online: 0, request_id: requestId });
    }

    const subs = await fetchActiveSubscriptions(svc, drivers.map((d) => d.user_id));
    
    await finishJob(svc, job!.id, "sent_internal", subs.length, null, null);
    await log(svc, { pedidoId, requestId, requested: subs.length, found: subs.length });

    return jsonResponse({
      success: true,
      message: `Notificação enviada internamente para ${subs.length} dispositivo(s).`,
      request_id: requestId,
      drivers_online: drivers.length,
      subscriptions_found: subs.length,
      recipients: subs.length,
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
    onesignal_notification_id: o.notificationId ?? null,
    response_status: o.status ?? 200,
    response_body_sanitized: o.raw ?? "sent_internal",
    error_code: o.errorCode ?? null,
    platform: o.platform ?? "all",
  });
}
