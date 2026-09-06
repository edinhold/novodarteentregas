import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { checkAdmin, getCaller } from "../_shared/push-db.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();

  const caller = await getCaller(req);
  if (!caller) {
    return jsonResponse({ success: false, code: "NAO_AUTENTICADO", message: "Sessão expirada. Entre novamente.", request_id: requestId }, 200);
  }

  const isAdmin = await checkAdmin(caller.id);
  if (!isAdmin) {
    return jsonResponse({ success: false, code: "SEM_PERMISSAO", message: "Apenas administradores podem enviar testes.", request_id: requestId }, 200);
  }

  return jsonResponse({
    success: true,
    edge_function_ok: true,
    onesignal_accepted: false,
    message: "Serviço OneSignal antigo foi removido do sistema. Aguardando nova implementação.",
    request_id: requestId,
  });
});
