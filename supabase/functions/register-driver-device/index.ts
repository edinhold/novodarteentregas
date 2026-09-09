import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getCaller, serviceClient } from "../_shared/push-db.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const svc = serviceClient();

  try {
    const caller = await getCaller(req);
    const body = await req.json().catch(() => ({}));

    const motoristaId = body?.motorista_id || caller?.id;
    const subscriptionId = (body?.subscription_id || body?.onesignal_subscription_id || "").trim();
    const platform = body?.platform || body?.plataforma || "web_pwa";
    const permissionStatus = body?.permission_status || "granted";
    const deviceName = body?.device_name || "Dispositivo Motorista";
    const deviceModel = body?.device_model || null;

    if (!motoristaId || !subscriptionId) {
      return jsonResponse(
        {
          success: false,
          code: "PARAMETROS_INVALIDOS",
          message: "Informe motorista_id e subscription_id.",
          request_id: requestId,
        },
        200
      );
    }

    const nowIso = new Date().toISOString();

    // 1. Deactivate previous active devices for this driver (enforce 1 active device per driver)
    await svc
      .from("driver_push_devices")
      .update({
        active: false,
        subscription_status: "inactive",
        updated_at: nowIso,
      })
      .eq("driver_id", motoristaId)
      .neq("subscription_id", subscriptionId);

    await svc
      .from("push_subscriptions")
      .update({
        active: false,
        subscription_status: "unsubscribed",
        updated_at: nowIso,
      })
      .eq("user_id", motoristaId)
      .neq("onesignal_subscription_id", subscriptionId);

    // 2. Upsert in driver_push_devices
    const { data: existingDev } = await svc
      .from("driver_push_devices")
      .select("id")
      .eq("subscription_id", subscriptionId)
      .maybeSingle();

    if (existingDev) {
      await svc
        .from("driver_push_devices")
        .update({
          driver_id: motoristaId,
          external_id: motoristaId,
          platform,
          active: true,
          subscription_status: "active",
          permission_status: permissionStatus,
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", existingDev.id);
    } else {
      await svc.from("driver_push_devices").insert({
        driver_id: motoristaId,
        external_id: motoristaId,
        subscription_id: subscriptionId,
        platform,
        active: true,
        subscription_status: "active",
        permission_status: permissionStatus,
        last_seen_at: nowIso,
        updated_at: nowIso,
      });
    }

    // 3. Upsert in push_subscriptions
    await svc.from("push_subscriptions").upsert(
      {
        user_id: motoristaId,
        profile_type: "motorista",
        platform,
        device_name: deviceName,
        device_model: deviceModel,
        onesignal_subscription_id: subscriptionId,
        onesignal_external_id: motoristaId,
        permission_status: permissionStatus,
        subscription_status: "subscribed",
        active: true,
        last_seen_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "onesignal_subscription_id" }
    );

    return jsonResponse({
      success: true,
      message: "Dispositivo registrado e ativado como exclusivo com sucesso.",
      motorista_id: motoristaId,
      subscription_id: subscriptionId,
      status: "active",
      request_id: requestId,
    });
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        code: "ERRO_REGISTRO_DISPOSITIVO",
        message: err?.message || "Erro ao registrar dispositivo.",
        request_id: requestId,
      },
      200
    );
  }
});
