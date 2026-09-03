import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { fetchActiveSubscriptions, fetchOnlineDrivers, getCaller, groupByPlatform, isAdmin, serviceClient, type Subscription } from "../_shared/push-db.ts";
import { buildPayload, humanize, loadConfig, sendNotification, type SendResult } from "../_shared/onesignal.ts";

const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://duarteentregas.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  try {
    const caller = await getCaller(req);
    if (!caller) return jsonResponse({ success: false, code: "NAO_AUTENTICADO", message: humanize("NAO_AUTENTICADO"), request_id: requestId });

    const svc = serviceClient();
    if (!(await isAdmin(svc, caller.id))) {
      return jsonResponse({ success: false, code: "SEM_PERMISSAO", message: "Apenas administradores podem enviar testes.", request_id: requestId });
    }

    const cfg = loadConfig();
    const body = await req.json().catch(() => ({}));
    const mode: string = body?.mode ?? "driver"; // driver | device | broadcast
    const platformFilter: string = body?.platform ?? "all";

    let subs: Subscription[] = [];

    if (mode === "device" && body?.subscription_id) {
      const { data } = await svc.from("push_subscriptions")
        .select("onesignal_subscription_id, platform, user_id")
        .eq("onesignal_subscription_id", body.subscription_id)
        .maybeSingle();
      if (data) subs = [data as Subscription];
    } else if (mode === "broadcast") {
      const drivers = await fetchOnlineDrivers(svc);
      subs = await fetchActiveSubscriptions(svc, drivers.map((d) => d.user_id));
    } else if (body?.driver_user_id) {
      subs = await fetchActiveSubscriptions(svc, [body.driver_user_id]);
    }

    if (platformFilter !== "all") {
      subs = subs.filter((s) => (platformFilter === "android_apk" ? s.platform === "android_apk" : s.platform !== "android_apk"));
    }

    if (subs.length === 0) {
      return jsonResponse({
        success: false,
        code: "SEM_INSCRICOES",
        message: "Nenhum dispositivo inscrito encontrado com os filtros escolhidos.",
        request_id: requestId,
        edge_function_ok: true,
      });
    }

    const groups = groupByPlatform(subs);
    const results: SendResult[] = [];
    for (const [platform, ids] of Object.entries(groups)) {
      const payload = buildPayload({
        appId: cfg.appId,
        subscriptionIds: ids,
        platform,
        headings: { pt: "🔔 Teste de Notificação Push", en: "Push notification test" },
        contents: { pt: "O sistema de notificações está funcionando neste aparelho.", en: "Push notifications are working on this device." },
        data: { tipo: "teste_push", rota: "/entregador", evento_id: `teste_push:${requestId}` },
        url: `${APP_BASE_URL}/entregador`,
        ttl: 120,
      });
      results.push(await sendNotification(cfg, payload, platform));
    }

    const anyOk = results.some((r) => r.ok);
    const recipients = results.reduce((s, r) => s + (r.recipients ?? 0), 0);

    for (const r of results) {
      await svc.from("notification_delivery_logs").insert({
        event_type: "teste_push",
        request_id: requestId,
        recipients_requested: r.requested,
        recipients_found: r.recipients ?? 0,
        onesignal_notification_id: r.notification_id ? `***${r.notification_id.slice(-8)}` : null,
        response_status: r.status,
        response_body_sanitized: r.raw,
        error_code: r.error_code ?? null,
        platform: r.platform,
      });
    }

    return jsonResponse({
      success: anyOk,
      request_id: requestId,
      edge_function_ok: true,
      onesignal_accepted: anyOk,
      code: anyOk ? undefined : results[0]?.error_code,
      message: anyOk
        ? `OneSignal aceitou a mensagem para ${recipients} aparelho(s).`
        : humanize(results[0]?.error_code),
      recipients_requested: subs.length,
      recipients_found: recipients,
      results: results.map((r) => ({
        platform: r.platform,
        requested: r.requested,
        recipients: r.recipients,
        http_status: r.status,
        notification_id: r.notification_id ? `***${r.notification_id.slice(-8)}` : null,
        error_code: r.error_code,
        error_message: r.error_message,
      })),
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      code: "ERRO_INTERNO",
      message: err instanceof Error ? err.message : String(err),
      request_id: requestId,
    });
  }
});
