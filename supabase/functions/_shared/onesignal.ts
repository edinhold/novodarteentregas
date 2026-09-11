export const ONESIGNAL_API = "https://api.onesignal.com/notifications?c=push";
export const ANDROID_CHANNEL_ID = "novas_entregas_v1";

export interface OneSignalConfig {
  appId: string;
  apiKey: string;
}

export class PushError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function loadConfig(): OneSignalConfig {
  const appId =
    Deno.env.get("ONESIGNAL_APP_ID")?.trim() ||
    Deno.env.get("VITE_ONESIGNAL_APP_ID")?.trim() ||
    "4f68f47f-63ee-4326-8f98-e63514f2b154";
  const apiKey =
    Deno.env.get("ONESIGNAL_APP_API_KEY")?.trim() ||
    Deno.env.get("ONESIGNAL_REST_API_KEY")?.trim() ||
    "";
  return { appId, apiKey };
}

export function mask(value?: string | null): string {
  if (!value) return "";
  return value.length <= 8 ? "***" : `***${value.slice(-8)}`;
}

export function humanize(code?: string): string {
  switch (code) {
    case "NAO_AUTENTICADO":
      return "Sessão expirada. Entre novamente.";
    case "SEM_MOTORISTAS_ONLINE":
      return "Nenhum motorista online e disponível no momento.";
    case "SEM_INSCRICOES":
      return "Os motoristas online não possuem dispositivos com notificações ativas.";
    case "PEDIDO_INDISPONIVEL":
      return "O pedido já foi aceito ou cancelado.";
    case "API_KEY_MISSING":
      return "REST API Key do OneSignal não configurada no servidor (ONESIGNAL_APP_API_KEY).";
    default:
      return "Falha ao enviar notificação.";
  }
}

export async function sendNotification(
  cfg: OneSignalConfig,
  payload: Record<string, unknown>
) {
  const requested = (payload.include_subscription_ids as string[] | undefined)?.length ?? 0;

  if (!cfg.apiKey) {
    return {
      ok: false,
      status: 401,
      notification_id: null,
      recipients: 0,
      raw: "ONESIGNAL_APP_API_KEY ausente ou não configurada no servidor/Edge Function.",
      error_code: "API_KEY_MISSING",
      error_message: "REST API Key do OneSignal não configurada nas variáveis de ambiente do backend.",
    };
  }

  try {
    const res = await fetch(ONESIGNAL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${cfg.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const osData = await res.json().catch(() => ({}));
    const hasError = !res.ok || (osData.errors && osData.errors.length > 0);
    const ok = res.ok && !!osData?.id && !hasError;
    const recipients = osData?.recipients ?? (ok ? requested : 0);
    const firstErr = Array.isArray(osData?.errors) ? osData.errors[0] : typeof osData?.errors === "object" ? JSON.stringify(osData.errors) : null;

    return {
      ok,
      status: res.status,
      notification_id: osData?.id || null,
      recipients: typeof recipients === "number" ? recipients : 0,
      raw: JSON.stringify(osData).slice(0, 1000),
      error_code: ok ? null : (firstErr ?? `HTTP_${res.status}`),
      error_message: ok ? null : (firstErr ?? `OneSignal HTTP ${res.status}`),
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      notification_id: null,
      recipients: 0,
      raw: err?.message || String(err),
      error_code: "ERRO_CONEXAO",
      error_message: err?.message || "Falha de conexão com a API do OneSignal.",
    };
  }
}

export async function cancelNotification(
  cfg: OneSignalConfig,
  notificationId: string
) {
  if (!cfg.apiKey || !notificationId) {
    return { ok: false, message: "API Key ou Notification ID não informado." };
  }

  try {
    const url = `https://api.onesignal.com/notifications/${notificationId}?app_id=${encodeURIComponent(cfg.appId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${cfg.apiKey}`,
      },
    });

    const osData = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: osData };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
