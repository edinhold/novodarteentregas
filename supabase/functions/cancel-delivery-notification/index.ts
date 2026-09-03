import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getCaller, serviceClient } from "../_shared/push-db.ts";
import { loadConfig } from "../_shared/onesignal.ts";

/**
 * Cancela/invalida a notificação de uma entrega já aceita.
 * Não gera som nem nova notificação: apenas apaga a mensagem antiga no OneSignal
 * e marca o job como cancelado (o Realtime remove o pedido das listas).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  try {
    const caller = await getCaller(req);
    if (!caller) return jsonResponse({ success: false, code: "NAO_AUTENTICADO", message: "Sessão expirada.", request_id: requestId });

    const { pedido_id } = await req.json().catch(() => ({}));
    if (!pedido_id) return jsonResponse({ success: false, code: "PARAMETRO_INVALIDO", message: "Informe pedido_id.", request_id: requestId });

    const svc = serviceClient();
    const cfg = loadConfig();

    const { data: job } = await svc
      .from("notification_jobs")
      .select("id, onesignal_notification_id, status")
      .eq("event_key", `nova_entrega:${pedido_id}`)
      .maybeSingle();

    let cancelled = false;
    if (job?.onesignal_notification_id) {
      const res = await fetch(
        `https://api.onesignal.com/notifications/${job.onesignal_notification_id}?app_id=${cfg.appId}`,
        { method: "DELETE", headers: { Authorization: `Key ${cfg.apiKey}` } },
      ).catch(() => null);
      cancelled = !!res?.ok;
    }

    if (job) {
      await svc.from("notification_jobs")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    return jsonResponse({ success: true, cancelled, request_id: requestId, sync_event: { tipo: "entrega_indisponivel", pedido_id, acao: "remover" } });
  } catch (err) {
    return jsonResponse({
      success: false,
      code: "ERRO_INTERNO",
      message: err instanceof Error ? err.message : String(err),
      request_id: requestId,
    });
  }
});
