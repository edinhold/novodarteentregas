import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();

  return jsonResponse({
    success: false,
    active: false,
    message: "Notificações Push desativadas (aguardando nova implantação limpa).",
    app_id: null,
    request_id: requestId,
  });
});
