import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

export type PushPlatform = "android_apk" | "web_pwa" | "ios";

export interface PushState {
  supported: boolean;
  platform: PushPlatform;
  permission: "granted" | "denied" | "default" | "unknown";
  subscriptionId: string | null;
  externalId: string | null;
  error?: string;
}

export const ONESIGNAL_APP_ID =
  import.meta.env.VITE_ONESIGNAL_APP_ID || "4f68f47f-63ee-4326-8f98-e63514f2b154";

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

let isSdkLoaded = false;
let isInitialized = false;

function loadOneSignalSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isSdkLoaded || document.getElementById("onesignal-sdk-script")) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "onesignal-sdk-script";
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.async = true;
    script.onload = () => {
      isSdkLoaded = true;
      console.log("[OneSignal:init]", { message: "SDK loaded successfully" });
      resolve();
    };
    script.onerror = (err) => {
      console.warn("[OneSignal:error]", { reason: "SDK_LOAD_FAILED", error: err });
      reject(err);
    };
    document.head.appendChild(script);
  });
}

/** Inicialização oficial do OneSignal Web SDK v16 */
export async function initPush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    await loadOneSignalSdk();

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      if (!isInitialized) {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          serviceWorkerPath:
            typeof window !== "undefined" && window.location.origin
              ? `${window.location.origin}/OneSignalSDKWorker.js`
              : "OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/" },
          allowLocalhostAsSecureOrigin: true,
          notifyButton: { enable: false },
        });
        isInitialized = true;
        console.log("[OneSignal:initialized]", { appId: ONESIGNAL_APP_ID });

        // Handler ao clicar na notificação
        OneSignal.Notifications.addEventListener("click", (event: any) => {
          console.log("[OneSignal:notification_click]", event);
          const notificationData = event.notification?.data;
          const rota = notificationData?.rota || "/entregador";
          if (typeof window !== "undefined" && window.location) {
            window.location.href = rota;
          }
        });

        // Registrar listener de mudanças de assinatura
        OneSignal.User.PushSubscription.addEventListener("change", async (change: any) => {
          console.log("[OneSignal:subscription_change]", change);
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.id) {
            await syncCurrentSubscription(authData.user.id);
          }
        });
      }
    });

    return true;
  } catch (err: any) {
    console.warn("[OneSignal:error]", { reason: "INIT_FAILED", message: err?.message });
    return false;
  }
}

/** Registrar dispositivo no backend garantindo apenas 1 dispositivo ativo por motorista */
async function registerDeviceWithBackend(
  userId: string,
  subscriptionId: string,
  permissionStatus: string = "granted"
): Promise<boolean> {
  if (!userId || !subscriptionId) return false;

  const platform = detectPlatform();
  const name = deviceName();

  console.log("[DeviceRegistration:start]", {
    motorista_id: userId,
    subscription_id: subscriptionId,
    platform,
  });

  try {
    // 1. Invocar Edge Router / Backend RPC para desativar anteriores e ativar este
    const { data, error } = await supabase.functions.invoke("register-driver-device", {
      body: {
        motorista_id: userId,
        subscription_id: subscriptionId,
        platform,
        permission_status: permissionStatus,
        device_name: name,
      },
    });

    if (error) {
      // Fallback para chamada direta via fetch ou banco se edge function local
      const res = await fetch("/api/edge-functions/register-driver-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motorista_id: userId,
          subscription_id: subscriptionId,
          platform,
          permission_status: permissionStatus,
          device_name: name,
        }),
      }).catch(() => null);

      if (!res || !res.ok) {
        // Direct DB fallback if RPC fails
        await supabase
          .from("driver_push_devices")
          .update({ active: false, subscription_status: "inactive", updated_at: new Date().toISOString() })
          .eq("driver_id", userId)
          .neq("subscription_id", subscriptionId);

        await supabase.from("driver_push_devices").upsert(
          {
            driver_id: userId,
            external_id: userId,
            subscription_id: subscriptionId,
            platform,
            active: true,
            subscription_status: "active",
            permission_status: permissionStatus,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "subscription_id" }
        );

        await supabase
          .from("push_subscriptions")
          .update({ active: false, subscription_status: "unsubscribed", updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .neq("onesignal_subscription_id", subscriptionId);

        await supabase.from("push_subscriptions").upsert(
          {
            user_id: userId,
            profile_type: "motorista",
            platform,
            device_name: name,
            onesignal_subscription_id: subscriptionId,
            onesignal_external_id: userId,
            permission_status: permissionStatus,
            subscription_status: "subscribed",
            active: true,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "onesignal_subscription_id" }
        );
      }
    }

    console.log("[DeviceRegistration:success]", {
      motorista_id: userId,
      subscription_id: subscriptionId,
      status: "active",
    });
    return true;
  } catch (err: any) {
    console.warn("[DeviceRegistration:error]", { motorista_id: userId, error: err?.message });
    return false;
  }
}

/** Solicitar permissões e ativar notificações push */
export async function enablePush(userId: string, profileType = "driver"): Promise<PushState> {
  const platform = detectPlatform();

  try {
    await initPush();

    let permission = "default";
    let subId: string | null = null;

    await new Promise<void>((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          const perm = await OneSignal.Notifications.requestPermission();
          permission = perm ? "granted" : "denied";

          if (perm) {
            if (userId) {
              await OneSignal.login(userId);
            }
            subId = OneSignal.User.PushSubscription.id || null;
            if (subId && userId) {
              await registerDeviceWithBackend(userId, subId, permission);
            }
          }
        } catch (e) {
          console.warn("[OneSignal:error]", { reason: "PERMISSION_REQUEST_FAILED", error: e });
        }
        resolve();
      });
    });

    return {
      supported: true,
      platform,
      permission: permission as any,
      subscriptionId: subId,
      externalId: userId,
    };
  } catch (err: any) {
    return {
      supported: false,
      platform,
      permission: "denied",
      subscriptionId: null,
      externalId: userId,
      error: err?.message || "Falha ao habilitar notificações.",
    };
  }
}

/** Sincronizar assinatura atual do motorista */
export async function syncCurrentSubscription(userId?: string, profileType = "driver"): Promise<PushState> {
  const platform = detectPlatform();
  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

  if (!uid) {
    return {
      supported: typeof window !== "undefined" && "Notification" in window,
      platform,
      permission: "default",
      subscriptionId: null,
      externalId: null,
    };
  }

  try {
    await initPush();

    let subId: string | null = null;
    let perm: string = "default";

    await new Promise<void>((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          perm = OneSignal.Notifications.permission ? "granted" : "denied";
          subId = OneSignal.User.PushSubscription.id || null;

          if (subId && uid && perm === "granted") {
            await OneSignal.login(uid);
            await registerDeviceWithBackend(uid, subId, perm);
          }
        } catch (e) {
          console.warn("[OneSignal:error]", { reason: "SYNC_FAILED", error: e });
        }
        resolve();
      });
    });

    return {
      supported: true,
      platform,
      permission: perm as any,
      subscriptionId: subId,
      externalId: uid,
    };
  } catch {
    return {
      supported: true,
      platform,
      permission: "default",
      subscriptionId: null,
      externalId: uid,
    };
  }
}

/** Desvincular e remover dispositivo manualmente */
export async function unregisterDevice(userId?: string, subscriptionId?: string | null): Promise<boolean> {
  console.log("[DeviceRegistration:unregister]", { userId, subscriptionId });

  try {
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

    if (subscriptionId) {
      await supabase
        .from("driver_push_devices")
        .update({ active: false, subscription_status: "deleted", updated_at: new Date().toISOString() })
        .eq("subscription_id", subscriptionId);

      await supabase
        .from("push_subscriptions")
        .update({ active: false, subscription_status: "unsubscribed", updated_at: new Date().toISOString() })
        .eq("onesignal_subscription_id", subscriptionId);
    } else if (uid) {
      await supabase
        .from("driver_push_devices")
        .update({ active: false, subscription_status: "deleted", updated_at: new Date().toISOString() })
        .eq("driver_id", uid);

      await supabase
        .from("push_subscriptions")
        .update({ active: false, subscription_status: "unsubscribed", updated_at: new Date().toISOString() })
        .eq("user_id", uid);
    }

    if (typeof window !== "undefined" && window.OneSignalDeferred) {
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          await OneSignal.User.PushSubscription.optOut();
        } catch (e) {
          console.warn("[OneSignal:error]", { reason: "OPTOUT_FAILED", error: e });
        }
      });
    }

    return true;
  } catch (err: any) {
    console.warn("[DeviceRegistration:error]", { reason: "UNREGISTER_FAILED", error: err?.message });
    return false;
  }
}

/** Disparar notificação de nova entrega via backend server engine */
export async function notifyAvailableDrivers(pedidoId: string): Promise<void> {
  console.log("[DeliveryNotification:trigger]", { pedidoId });

  try {
    const { data, error } = await supabase.functions.invoke("notify-available-drivers", {
      body: { pedido_id: pedidoId },
    });

    if (error) {
      await fetch("/api/edge-functions/notify-available-drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido_id: pedidoId }),
      }).catch(() => null);
    }
  } catch (e) {
    console.warn("[DeliveryNotification:error]", { pedidoId, error: e });
  }
}

/** Cancelar notificação de entrega no backend */
export async function cancelDeliveryNotification(pedidoId: string): Promise<void> {
  try {
    await supabase.functions.invoke("cancel-delivery-notification", {
      body: { pedido_id: pedidoId },
    });
  } catch (e) {
    console.warn("[DeliveryNotification:cancel_error]", { pedidoId, error: e });
  }
}
