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
  const appId = Deno.env.get("ONESIGNAL_APP_ID")?.trim();
  const apiKey = Deno.env.get("ONESIGNAL_APP_API_KEY")?.trim();
  if (!appId) throw new PushError("SECRETS_AUSENTES", "ONESIGNAL_APP_ID não configurado no backend.", 500);
  if (!apiKey) throw new PushError("SECRETS_AUSENTES", "ONESIGNAL_APP_API_KEY não configurado no backend.", 500);
  return { appId, apiKey };
}

export function mask(value?: string | null): string {
  if (!value) return "";
  return value.length <= 8 ? "***" : `***${value.slice(-8)}`;
}

export function sanitize(body: unknown): string {
  let text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  if (text.length > 2000) text = `${text.slice(0, 2000)}…`;
  return text
    .replace(/(os_v2_[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1***")
    .replace(/(Basic|Bearer)\s+[A-Za-z0-9._-]+/gi, "$1 ***")
    .replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-([0-9a-f]{4})[0-9a-f]{8}/gi, "$1-****-$2***");
}

type Platform = "android_apk" | "web_pwa" | "ios" | string;

/**
 * Payload otimizado para entrega garantida em segundo plano e tela desligada:
 * - priority: 10 (Alta prioridade instantânea)
 * - android_visibility: 1 (Exibição em tela de bloqueio com tela desligada)
 * - content_available: true (Acorda processos em segundo plano)
 * - som e vibração de alta penetração
 */
export function buildPayload(opts: {
  appId: string;
  subscriptionIds: string[];
  platform: Platform;
  headings: Record<string, string>;
  contents: Record<string, string>;
  data: Record<string, unknown>;
  url?: string;
  ttl?: number;
  buttonLabel?: string;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    app_id: opts.appId,
    include_subscription_ids: opts.subscriptionIds,
    target_channel: "push",
    headings: opts.headings,
    contents: opts.contents,
    data: opts.data,
    priority: 10, // Máxima prioridade para entregar mesmo com tela desligada / background
    ttl: opts.ttl ?? 86400, // 24 horas de janela de vida
    content_available: true, // Acorda o app no Android/iOS em segundo plano
    chrome_web_icon: "/pwa-192x192.png",
    chrome_web_badge: "/pwa-192x192.png",
    small_icon: "ic_stat_onesignal_default",
  };

  if (opts.url) base.url = opts.url;

  if (opts.platform === "android_apk") {
    base.android_channel_id = ANDROID_CHANNEL_ID;
    base.android_visibility = 1; // 1 = PUBLIC (Visível na tela de bloqueio com tela desligada)
    base.android_sound = "notification_sound";
    base.android_accent_color = "FFF97316";
    if (opts.buttonLabel) {
      base.buttons = [{ id: "ver_entrega", text: opts.buttonLabel }];
    }
  } else {
    base.web_push_topic = String(opts.data?.evento_id ?? "duarte-push");
    if (opts.buttonLabel && opts.url) {
      base.web_buttons = [{ id: "ver_entrega", text: opts.buttonLabel, url: opts.url }];
    }
  }

  return base;
}

export interface SendResult {
  platform: string;
  requested: number;
  status: number;
  ok: boolean;
  notification_id?: string;
  recipients?: number;
  error_code?: string;
  error_message?: string;
  raw: string;
}

const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];

export async function sendNotification(
  cfg: OneSignalConfig,
  payload: Record<string, unknown>,
  platform: string,
): Promise<SendResult> {
  const requested = (payload.include_subscription_ids as string[] | undefined)?.length ?? 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(ONESIGNAL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${cfg.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* keep raw */ }

    const apiErrors: string[] = Array.isArray(json?.errors)
      ? json.errors.map((e: unknown) => (typeof e === "string" ? e : JSON.stringify(e)))
      : json?.errors ? [JSON.stringify(json.errors)] : [];

    const ok = res.ok && !!json?.id && apiErrors.length === 0;

    return {
      platform,
      requested,
      status: res.status,
      ok,
      notification_id: json?.id,
      recipients: json?.recipients ?? json?.external_id ?? 0,
      error_code: ok ? undefined : classify(res.status, apiErrors.join(" | ")),
      error_message: ok ? undefined : (apiErrors.join(" | ") || `HTTP ${res.status}`),
      raw: sanitize(text),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      platform,
      requested,
      status: 0,
      ok: false,
      error_code: msg.includes("abort") ? "TIMEOUT_ONESIGNAL" : "ERRO_CONEXAO",
      error_message: msg.includes("abort") ? "O OneSignal não respondeu a tempo (timeout)." : `Falha de conexão: ${msg}`,
      raw: sanitize(msg),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function isRetryable(result: SendResult): boolean {
  if (result.status === 0) return true;
  if (RETRYABLE_STATUS.includes(result.status)) return true;
  return false;
}

function classify(status: number, errText: string): string {
  const t = errText.toLowerCase();
  if (status === 401 || status === 403 || t.includes("invalid_bearer") || t.includes("api key")) return "CHAVE_INVALIDA";
  if (t.includes("app_id") || t.includes("app not found")) return "APP_ID_INVALIDO";
  if (t.includes("no subscribers") || t.includes("all included players") || t.includes("invalid_player_ids")) {
    return "NENHUMA_INSCRICAO_VALIDA";
  }
  if (status === 400) return "PAYLOAD_INVALIDO";
  if (RETRYABLE_STATUS.includes(status)) return "ERRO_TEMPORARIO";
  return "ERRO_ONESIGNAL";
}

export function humanize(code?: string): string {
  switch (code) {
    case "SECRETS_AUSENTES": return "As credenciais do OneSignal não estão configuradas no backend.";
    case "CHAVE_INVALIDA": return "A App API Key do OneSignal é inválida ou expirou.";
    case "APP_ID_INVALIDO": return "O OneSignal App ID não corresponde à chave usada.";
    case "NENHUMA_INSCRICAO_VALIDA": return "Nenhuma inscrição válida — o aparelho foi desinscrito ou o ID está obsoleto.";
    case "PAYLOAD_INVALIDO": return "O OneSignal recusou o conteúdo da mensagem (payload inválido).";
    case "TIMEOUT_ONESIGNAL": return "O OneSignal não respondeu a tempo.";
    case "ERRO_CONEXAO": return "Falha de conexão com o OneSignal.";
    case "SEM_MOTORISTAS_ONLINE": return "Nenhum motorista online e disponível no momento.";
    case "SEM_INSCRICOES": return "Os motoristas online não possuem dispositivos com notificações ativas.";
    case "PEDIDO_INDISPONIVEL": return "O pedido já foi aceito ou cancelado.";
    case "NAO_AUTENTICADO": return "Sessão expirada. Entre novamente.";
    default: return "Falha ao enviar a notificação.";
  }
}
