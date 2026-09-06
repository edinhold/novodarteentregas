import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { checkAdmin, getCaller, serviceClient } from "../_shared/push-db.ts";
import { mask } from "../_shared/onesignal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  const svc = serviceClient();

  try {
    const caller = await getCaller(req);
    if (!caller) {
      return jsonResponse({ success: false, code: "NAO_AUTENTICADO", message: "Sessão expirada.", request_id: requestId }, 200);
    }

    const body = await req.json().catch(() => ({}));
    const isAdmin = await checkAdmin(caller.id);
    const targetUserId = body?.user_id ?? (isAdmin ? undefined : caller.id);

    if (!isAdmin && targetUserId !== caller.id) {
      return jsonResponse({ success: false, code: "SEM_PERMISSAO", message: "Sem permissão.", request_id: requestId }, 200);
    }

    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: drivers } = await svc
      .from("drivers")
      .select("user_id, full_name, is_online, is_active, approval_status, last_seen_at, driver_code, suspended_until")
      .eq("approval_status", "approved")
      .order("full_name");

    const userIds = (drivers ?? []).map((d) => d.user_id);
    const { data: subsRaw } = await svc
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    const byUser = new Map<string, any[]>();
    for (const s of subsRaw ?? []) {
      (byUser.get(s.user_id) ?? byUser.set(s.user_id, []).get(s.user_id)!).push(s);
    }

    const list = (drivers ?? []).map((d) => {
      const devices = (byUser.get(d.user_id) ?? []).map((s) => ({
        id: s.id,
        subscription_id_masked: mask(s.onesignal_subscription_id),
        subscription_id: s.onesignal_subscription_id,
        platform: s.platform,
        device_name: s.device_name,
        permission_status: s.permission_status,
        subscription_status: s.subscription_status,
        active: s.active,
        app_version: s.app_version,
        sdk_version: s.sdk_version,
        last_seen_at: s.last_seen_at,
      }));

      const isSuspended = d.suspended_until && new Date(d.suspended_until) > new Date();
      const online = d.is_active && d.is_online && !isSuspended && !!d.last_seen_at && d.last_seen_at >= cutoff;

      const recommendations: string[] = [];
      if (devices.length === 0) {
        recommendations.push("Nenhum aparelho registrado.");
      }
      if (isSuspended) {
        recommendations.push("Motorista suspenso temporariamente.");
      } else if (!online) {
        recommendations.push("Motorista offline ou sem sinal nos últimos 15 min.");
      }
      if (recommendations.length === 0) {
        recommendations.push("Dispositivo online.");
      }

      return {
        user_id: d.user_id,
        full_name: d.full_name,
        driver_code: d.driver_code,
        online,
        available: d.is_active && !isSuspended,
        approval_status: d.approval_status,
        last_seen_at: d.last_seen_at,
        devices,
        recommendations,
      };
    });

    const detail = targetUserId ? list.find((d) => d.user_id === targetUserId) ?? null : null;

    const { data: logs } = await svc
      .from("notification_delivery_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);

    return jsonResponse({
      success: true,
      request_id: requestId,
      config: {
        push_provider: "none",
        push_status: "removed_pending_reimplementation",
        online_window_minutes: 15,
      },
      drivers: list,
      detail,
      logs: logs ?? [],
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      code: "ERRO_INTERNO",
      message: "Erro no diagnóstico.",
      detail: err instanceof Error ? err.message : String(err),
      request_id: requestId,
    }, 200);
  }
});
