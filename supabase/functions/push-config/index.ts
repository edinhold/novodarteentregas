import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

// Publishable configuration for the frontend SDKs. Never exposes the API key.
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const appId = Deno.env.get("ONESIGNAL_APP_ID")?.trim() ?? "";
  return jsonResponse({
    success: !!appId,
    code: appId ? undefined : "SECRETS_AUSENTES",
    message: appId ? undefined : "ONESIGNAL_APP_ID não configurado no backend.",
    app_id: appId,
    android_channel_id: "novas_entregas_v1",
    sdk_version: "web-v16",
  });
});
