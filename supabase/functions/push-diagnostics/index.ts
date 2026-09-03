import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getCaller, isAdmin, ONLINE_WINDOW_MINUTES, serviceClient } from "../_shared/push-db.ts";
import { mask } from "../_shared/onesignal.ts";

/**
 * mode "overview" (body vazio): lista motoristas + dispositivos.
 * mode "detail" (user_id): diagnóstico completo de um motorista.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  try {
    const caller = await getCaller(req);
    if (!caller) return jsonResponse({ success: false, code: "NAO_AUTENTICADO", message: "Sessão expirada. Entre novamente.", request_id: requestId });

    const svc = serviceClient();
    const admin = await isAdmin(svc, caller.id);
    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body?.user_id ?? (admin ? undefined : caller.id);
    if (!admin && targetUserId !== caller.id) {
      return jsonResponse({ success: false, code: "SEM_PERMISSAO", message: "Sem permissão para este diagnóstico.", request_id: requestId });
    }

    const appId = Deno.env.get("ONESIGNAL_APP_ID")?.trim() ?? "";
    const hasApiKey = !!Deno.env.get("ONESIGNAL_APP_API_KEY")?.trim();
    const cutoff = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000).toISOString();

    const { data: drivers } = await svc
      .from("drivers")
      .select("user_id, full_name, is_online, is_active, approval_status, last_seen_at, driver_code")
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
      const online = d.is_active && d.is_online && !!d.last_seen_at && d.last_seen_at >= cutoff;
      return {
        user_id: d.user_id,
        full_name: d.full_name,
        driver_code: d.driver_code,
        online,
        available: d.is_active,
        approval_status: d.approval_status,
        last_seen_at: d.last_seen_at,
        devices,
        recommendations: recommend(online, devices),
      };
    });

    const detail = targetUserId ? list.find((d) => d.user_id === targetUserId) ?? null : null;

    const { data: logs } = await svc
      .from("notification_delivery_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    return jsonResponse({
      success: true,
      request_id: requestId,
      config: {
        app_id_masked: mask(appId),
        app_id_present: !!appId,
        api_key_present: hasApiKey,
        android_channel_id: "novas_entregas_v1",
        online_window_minutes: ONLINE_WINDOW_MINUTES,
      },
      drivers: list,
      detail,
      logs: logs ?? [],
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

function recommend(online: boolean, devices: any[]): string[] {
  const out: string[] = [];
  if (devices.length === 0) out.push("Subscription ID ausente — o motorista ainda não ativou as notificações no aparelho.");
  if (devices.some((d) => d.permission_status === "denied")) out.push("Permissão negada no aparelho — reative nas configurações do Android.");
  if (devices.some((d) => d.subscription_status !== "subscribed")) out.push("Dispositivo desinscrito — peça para abrir o app e tocar em Ativar notificações.");
  if (devices.length > 0 && devices.every((d) => !d.active)) out.push("Todas as inscrições estão inativas — o PWA pode precisar ser reinstalado.");
  if (!online) out.push("Motorista offline — só recebe alertas de novas entregas quem está online.");
  const stale = devices.find((d) => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() > 7 * 864e5);
  if (stale) out.push("Última sincronização há mais de 7 dias — economia de bateria ou app forçado a parar.");
  if (out.length === 0) out.push("Configuração correta: dispositivo apto a receber notificações.");
  return out;
}
