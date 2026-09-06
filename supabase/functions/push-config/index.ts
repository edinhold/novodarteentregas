import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { loadConfig } from "../_shared/onesignal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const cfg = loadConfig();

  return jsonResponse({
    success: true,
    active: true,
    app_id: cfg.appId,
    request_id: requestId,
  });
});
