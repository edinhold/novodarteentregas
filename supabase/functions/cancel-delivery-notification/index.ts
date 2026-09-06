import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getCaller, serviceClient } from "../_shared/push-db.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const svc = serviceClient();

  try {
    const caller = await getCaller(req);
    if (!caller) {
      return jsonResponse({ success: false, code: "NAO_AUTENTICADO", message: "Sessão expirada. Entre novamente.", request_id: requestId }, 200);
    }

    const body = await req.json().catch(() => ({}));
    const pedidoId: string | undefined = body?.pedido_id;
    if (!pedidoId) {
      return jsonResponse({ success: false, code: "PARAMETRO_INVALIDO", message: "Informe pedido_id.", request_id: requestId }, 200);
    }

    const { data: job } = await svc
      .from("notification_jobs")
      .select("id, status")
      .eq("event_key", `nova_entrega:${pedidoId}`)
      .maybeSingle();

    if (job) {
      await svc.from("notification_jobs").update({
        status: "cancelled",
        processed_at: new Date().toISOString(),
      }).eq("id", job.id);
    }

    return jsonResponse({
      success: true,
      message: "Notificação cancelada internamente.",
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
