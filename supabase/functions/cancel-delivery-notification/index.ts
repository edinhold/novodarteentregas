import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/push-db.ts";
import { loadConfig, cancelNotification } from "../_shared/onesignal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const svc = serviceClient();

  try {
    const body = await req.json().catch(() => ({}));
    const pedidoId: string | undefined = body?.pedido_id;
    if (!pedidoId) {
      return jsonResponse({ success: false, code: "PARAMETRO_INVALIDO", message: "Informe pedido_id.", request_id: requestId }, 200);
    }

    // 1. Fetch notification job for this order to get OneSignal notification id
    const { data: job } = await svc
      .from("notification_jobs")
      .select("id, status, onesignal_notification_id")
      .eq("event_key", `nova_entrega:${pedidoId}`)
      .maybeSingle();

    const { data: log } = await svc
      .from("notification_delivery_logs")
      .select("onesignal_notification_id")
      .eq("pedido_id", pedidoId)
      .not("onesignal_notification_id", "is", null)
      .order("created_at", { ascending: false })
      .maybeSingle();

    const osNotificationId = job?.onesignal_notification_id || log?.onesignal_notification_id;

    let osCancelled = false;
    if (osNotificationId) {
      const cfg = loadConfig();
      const cancelRes = await cancelNotification(cfg, osNotificationId);
      osCancelled = cancelRes.ok;
    }

    if (job) {
      await svc.from("notification_jobs").update({
        status: "cancelled",
        processed_at: new Date().toISOString(),
        last_error: "Notificação cancelada/removida pois a entrega foi aceita ou alterada.",
      }).eq("id", job.id);
    }

    return jsonResponse({
      success: true,
      onesignal_cancelled: osCancelled,
      message: "Notificação cancelada e removida dos dispositivos dos motoristas.",
      request_id: requestId,
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      code: "ERRO_INTERNO",
      message: "Erro ao cancelar notificação.",
      detail: err instanceof Error ? err.message : String(err),
      request_id: requestId,
    }, 200);
  }
});
