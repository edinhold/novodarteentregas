import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { checkAdmin, fetchActiveSubscriptions, getCaller, serviceClient } from "../_shared/push-db.ts";
import { loadConfig, mask, sendNotification } from "../_shared/onesignal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const svc = serviceClient();

  try {
    const caller = await getCaller(req);
    if (!caller) {
      return jsonResponse(
        {
          success: false,
          edge_function_ok: true,
          code: "NAO_AUTENTICADO",
          message: "Sessão expirada. Entre novamente.",
          request_id: requestId,
        },
        200
      );
    }

    const isAdmin = await checkAdmin(caller.id);
    if (!isAdmin) {
      return jsonResponse(
        {
          success: false,
          edge_function_ok: true,
          code: "SEM_PERMISSAO",
          message: "Apenas administradores podem enviar testes.",
          request_id: requestId,
        },
        200
      );
    }

    const body = await req.json().catch(() => ({}));
    const mode: string = body?.mode ?? "driver";
    const platformFilter: string = body?.platform ?? "all";

    let subs: Array<{ onesignal_subscription_id: string; platform: string; user_id: string }> = [];

    if (mode === "device" && body?.subscription_id) {
      const { data: subData } = await svc
        .from("push_subscriptions")
        .select("onesignal_subscription_id, platform, user_id")
        .eq("onesignal_subscription_id", body.subscription_id)
        .maybeSingle();

      if (subData) {
        subs = [subData];
      } else {
        const { data: devData } = await svc
          .from("driver_push_devices")
          .select("subscription_id, platform, driver_id")
          .eq("subscription_id", body.subscription_id)
          .maybeSingle();

        if (devData && devData.subscription_id) {
          subs = [
            {
              onesignal_subscription_id: devData.subscription_id,
              platform: devData.platform,
              user_id: devData.driver_id,
            },
          ];
        }
      }
    } else if (mode === "broadcast") {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: onlineDrivers } = await svc
        .from("drivers")
        .select("user_id")
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .eq("is_online", true)
        .gte("last_seen_at", cutoff);

      const ids = (onlineDrivers ?? []).map((d) => d.user_id);
      if (ids.length > 0) {
        subs = await fetchActiveSubscriptions(svc, ids);
      }
    } else if (body?.driver_user_id) {
      subs = await fetchActiveSubscriptions(svc, [body.driver_user_id]);
    }

    if (platformFilter !== "all") {
      subs = subs.filter((s) =>
        platformFilter === "android_apk" ? s.platform === "android_apk" : s.platform !== "android_apk"
      );
    }

    const subIds = Array.from(new Set(subs.map((s) => s.onesignal_subscription_id))).filter(Boolean);

    if (subIds.length === 0) {
      return jsonResponse({
        success: false,
        edge_function_ok: true,
        onesignal_accepted: false,
        code: "SEM_INSCRICOES",
        message: "Nenhum dispositivo com notificações ativas encontrado para o teste selecionado.",
        request_id: requestId,
        recipients_requested: 0,
        recipients_found: 0,
      });
    }

    const cfg = loadConfig();
    const payload = {
      app_id: cfg.appId,
      include_subscription_ids: subIds,
      target_channel: "push",
      headings: { pt: "🔔 Teste de Notificação Duarte", en: "Duarte Push Test" },
      contents: {
        pt: "O sistema de notificações push está funcionando perfeitamente!",
        en: "Push notifications are working perfectly!",
      },
      data: {
        tipo: "teste_push",
        rota: "/entregador",
        evento_id: `teste_push:${requestId}`,
      },
      android_channel_id: "novas_entregas_v1",
      priority: 10,
      ttl: 120,
    };

    const osResult = await sendNotification(cfg, payload);

    await svc.from("notification_delivery_logs").insert({
      event_type: `teste_${mode}`,
      request_id: requestId,
      recipients_requested: subIds.length,
      recipients_found: osResult.recipients,
      onesignal_notification_id: osResult.notification_id ? mask(osResult.notification_id) : null,
      response_status: osResult.status,
      response_body_sanitized: osResult.raw,
      error_code: osResult.error_code,
      platform: platformFilter,
    });

    return jsonResponse({
      success: osResult.ok,
      edge_function_ok: true,
      onesignal_accepted: osResult.ok,
      message: osResult.ok
        ? `Notificação de teste enviada com sucesso pelo OneSignal para ${osResult.recipients} dispositivo(s)!`
        : osResult.error_message
        ? `OneSignal recusou envio: ${osResult.error_message}`
        : "Recusado pelo OneSignal.",
      request_id: requestId,
      recipients_requested: subIds.length,
      recipients_found: osResult.recipients,
      onesignal_notification_id: osResult.notification_id,
      results: [
        {
          platform: platformFilter,
          http_status: osResult.status,
          notification_id: osResult.notification_id,
          recipients: osResult.recipients,
          error_code: osResult.error_code,
          error_message: osResult.error_message,
        },
      ],
    });
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        edge_function_ok: true,
        onesignal_accepted: false,
        code: "ERRO_EDGE_FUNCTION",
        message: err?.message || "Erro interno na Edge Function push-test.",
        request_id: requestId,
      },
      200
    );
  }
});
