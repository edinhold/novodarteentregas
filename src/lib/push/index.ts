import { supabase } from "@/integrations/supabase/client";

export type PushPlatform = "android_apk" | "web_pwa" | "ios";

export interface PushState {
  supported: boolean;
  platform: PushPlatform;
  permission: "granted" | "denied" | "default" | "unknown";
  subscriptionId: string | null;
  externalId: string | null;
  error?: string;
}

export function detectPlatform(): PushPlatform {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isMedian = typeof window !== "undefined" && typeof (window as any).isMedianApp === "function" ? (window as any).isMedianApp() : /median|gonative/i.test(ua);
  if (isMedian) return "android_apk";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "web_pwa";
}

export function deviceName(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const model = ua.match(/\(([^)]+)\)/)?.[1]?.split(";").slice(-1)[0]?.trim();
  const standalone = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches ? " (PWA)" : "";
  return `${model || "Dispositivo"}${standalone}`.slice(0, 80);
}

export async function getAppId(): Promise<string | null> {
  return null;
}

/** Stub de inicialização limpo (preparado para nova implantação) */
export async function initPush(): Promise<boolean> {
  return false;
}

/** Stub de solicitação e ativação de permissões */
export async function enablePush(userId: string, profileType = "driver"): Promise<PushState> {
  const platform = detectPlatform();
  return {
    supported: false,
    platform,
    permission: "default",
    subscriptionId: null,
    externalId: userId,
    error: "Notificações push temporariamente desativadas (aguardando nova implantação).",
  };
}

/** Stub de sincronização de assinatura */
export async function syncCurrentSubscription(userId?: string, profileType = "driver"): Promise<PushState> {
  const platform = detectPlatform();
  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
  return {
    supported: false,
    platform,
    permission: "default",
    subscriptionId: null,
    externalId: uid,
  };
}

/** Stub de desvinculação de dispositivo */
export async function unregisterDevice(userId?: string, subscriptionId?: string | null): Promise<boolean> {
  return true;
}

/** Stub de logout */
export async function logoutPush(): Promise<void> {}

/** Notificação de entregadores via banco de dados/logs (sem dependência de terceiros) */
export async function notifyAvailableDrivers(pedidoId: string): Promise<void> {
  try {
    const { data: drivers } = await supabase
      .from("drivers")
      .select("user_id")
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .eq("is_online", true);

    const count = drivers?.length || 0;
    await supabase.from("notification_delivery_logs").insert({
      pedido_id: pedidoId,
      event_type: "nova_entrega",
      recipients_requested: count,
      recipients_found: count,
      status: count > 0 ? "queued" : "no_drivers_online",
    });
  } catch (e) {
    console.warn("[push] Erro ao registrar log de entrega:", e);
  }
}

export async function cancelDeliveryNotification(pedidoId: string): Promise<void> {}
