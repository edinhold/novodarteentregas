import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
    plugins?: any;
    cordova?: any;
    
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

let appIdCache: string | null = null;
let initPromise: Promise<boolean> | null = null;
const SDK_VERSION = "web-v16";

export function detectPlatform(): PushPlatform {
  const ua = navigator.userAgent || "";
  const isCordova = typeof window !== "undefined" && (!!window.cordova || !!window.plugins?.OneSignal);
  const isMedian = typeof window.isMedianApp === "function" ? window.isMedianApp() : /median|gonative/i.test(ua);
  if (isCordova || isMedian) return "android_apk";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "web_pwa";
}

export function deviceName(): string {
  const ua = navigator.userAgent || "";
  const model = ua.match(/\(([^)]+)\)/)?.[1]?.split(";").slice(-1)[0]?.trim();
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ? " (PWA)" : "";
  return `${model || "Dispositivo"}${standalone}`.slice(0, 80);
}

export async function getAppId(): Promise<string | null> {
  if (appIdCache) return appIdCache;
  try {
    const { data, error } = await supabase.functions.invoke("push-config", { body: {} });
    if (error) throw error;
    appIdCache = data?.app_id || null;
    return appIdCache;
  } catch {
    return null;
  }
}

function loadWebSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.OneSignal) return resolve();
    const existing = document.querySelector<HTMLScriptElement>("script[data-onesignal]");
    if (existing) return existing.addEventListener("load", () => resolve());
    const s = document.createElement("script");
    s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    s.defer = true;
    s.dataset.onesignal = "true";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar o SDK do OneSignal."));
    document.head.appendChild(s);
  });
}

/** Initializes the correct SDK (web v16 or Cordova) exactly once. */
export async function initPush(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const appId = await getAppId();
    if (!appId) return false;

    if (detectPlatform() === "android_apk") return initCordova(appId);

    await loadWebSdk();
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    await new Promise<void>((resolve) => {
      window.OneSignalDeferred!.push(async (OneSignal: any) => {
        try {
          await OneSignal.init({
            appId,
            serviceWorkerPath: "/OneSignalSDKWorker.js",
            serviceWorkerParam: { scope: "/onesignal/" },
            allowLocalhostAsSecureOrigin: true,
          });
        } catch (e) {
          console.warn("[push] init web", e);
        }
        resolve();
      });
    });
    return true;
  })();
  return initPromise;
}

function initCordova(appId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const start = () => {
      const OS = window.plugins?.OneSignal || window.OneSignal;
      if (!OS) {
        console.warn("[push] plugin OneSignal Cordova não encontrado");
        return resolve(false);
      }
      try {
        if (typeof OS.initialize === "function") OS.initialize(appId);
        else if (typeof OS.setAppId === "function") OS.setAppId(appId);
        OS.Notifications?.addEventListener?.("click", (ev: any) => handleClick(ev?.notification?.additionalData));
        OS.User?.pushSubscription?.addEventListener?.("change", () => void syncCurrentSubscription());
        resolve(true);
      } catch (e) {
        console.warn("[push] init cordova", e);
        resolve(false);
      }
    };
    if (window.cordova) document.addEventListener("deviceready", start, { once: true });
    else start();
  });
}

function handleClick(data: any) {
  const rota = data?.rota;
  if (rota && typeof rota === "string") window.location.assign(rota);
}

/** Requests permission and stores the subscription for the given user. */
export async function enablePush(userId: string, profileType = "driver"): Promise<PushState> {
  const platform = detectPlatform();
  const ok = await initPush();
  if (!ok) return { supported: false, platform, permission: "unknown", subscriptionId: null, externalId: null, error: "Configuração de push indisponível." };

  if (platform === "android_apk") {
    const OS = window.plugins?.OneSignal || window.OneSignal;
    try {
      await OS?.Notifications?.requestPermission?.(true);
      await OS?.login?.(userId);
    } catch (e) { console.warn("[push] cordova permission", e); }
    return syncCurrentSubscription(userId, profileType);
  }

  const OneSignal = window.OneSignal;
  try {
    await OneSignal?.login?.(userId);
    if (OneSignal?.Notifications?.permission !== true) {
      await OneSignal?.Notifications?.requestPermission();
    }
  } catch (e) { console.warn("[push] web permission", e); }
  return syncCurrentSubscription(userId, profileType);
}

export async function syncCurrentSubscription(userId?: string, profileType = "driver"): Promise<PushState> {
  const platform = detectPlatform();
  let subscriptionId: string | null = null;
  let permission: PushState["permission"] = "unknown";

  try {
    if (platform === "android_apk") {
      const OS = window.plugins?.OneSignal || window.OneSignal;
      subscriptionId = OS?.User?.pushSubscription?.id ?? (await OS?.User?.pushSubscription?.getIdAsync?.()) ?? null;
      const opted = OS?.User?.pushSubscription?.optedIn ?? (await OS?.User?.pushSubscription?.getOptedInAsync?.());
      permission = opted ? "granted" : "denied";
    } else {
      const OneSignal = window.OneSignal;
      subscriptionId = OneSignal?.User?.PushSubscription?.id ?? null;
      const p = OneSignal?.Notifications?.permission;
      permission = p === true ? "granted" : Notification?.permission === "denied" ? "denied" : "default";
    }
  } catch (e) {
    console.warn("[push] sync", e);
  }

  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
  if (uid && subscriptionId) {
    await supabase.from("push_subscriptions").upsert(
      {
        user_id: uid,
        profile_type: profileType,
        platform,
        device_name: deviceName(),
        onesignal_subscription_id: subscriptionId,
        onesignal_external_id: uid,
        permission_status: permission,
        subscription_status: permission === "granted" ? "subscribed" : "unsubscribed",
        active: permission === "granted",
        app_version: import.meta.env.VITE_APP_VERSION ?? "web",
        sdk_version: SDK_VERSION,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "onesignal_subscription_id" },
    );
  }

  return { supported: true, platform, permission, subscriptionId, externalId: uid };
}

export async function logoutPush() {
  try {
    if (detectPlatform() === "android_apk") await (window.plugins?.OneSignal || window.OneSignal)?.logout?.();
    else await window.OneSignal?.logout?.();
  } catch { /* noop */ }
}

/** Fire-and-forget backend trigger. Never blocks or breaks order creation. */
export async function notifyAvailableDrivers(pedidoId: string) {
  try {
    const { data, error } = await supabase.functions.invoke("notify-available-drivers", { body: { pedido_id: pedidoId } });
    if (error) console.warn("[push] notify error", error);
    else console.info("[push] notify result", data);
  } catch (e) {
    console.warn("[push] notify failed", e);
  }
}

export async function cancelDeliveryNotification(pedidoId: string) {
  try {
    await supabase.functions.invoke("cancel-delivery-notification", { body: { pedido_id: pedidoId } });
  } catch { /* noop */ }
}
