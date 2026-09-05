import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { playUrgentNotification } from "@/lib/notificationSound";

import { toast } from "sonner";


export type OverlayState = "loading" | "success" | "error" | "empty";

export interface OverlayDelivery {
  id: string;
  pickup_address: string;
  delivery_address: string;
  driver_fee: number | null;
  credit_cost: number | null;
  distance_km?: number | null;
  restaurant?: {
    name?: string | null;
    address?: string | null;
  } | null;
}

interface Options {
  /** Only show overlay when driver is in standby (no active delivery). */
  standby: boolean;
  /** Auto-dismiss timeout in ms. */
  timeoutMs?: number;
  /** Called after a successful accept so caller can navigate / refresh. */
  onAccepted?: (delivery: OverlayDelivery) => void;
}

/**
 * Listens for newly inserted pending delivery requests in realtime and
 * exposes the latest one for the overlay UI. Plays sound + vibration
 * while the overlay is active and supports an auto-dismiss timeout.
 */
export function useDeliveryOverlay({ standby, timeoutMs = 30000, onAccepted }: Options) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [delivery, setDelivery] = useState<OverlayDelivery | null>(null);
  const [state, setState] = useState<OverlayState>("empty");
  const [permissionWarning, setPermissionWarning] = useState(false);
  const checkPermission = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermissionWarning(true);
      return;
    }
    setPermissionWarning(Notification.permission !== "granted");
  }, []);
  const DISMISSED_KEY = "delivery-overlay-dismissed";
  const loadDismissed = (): Set<string> => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(DISMISSED_KEY) : null;
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr.slice(-500) : []);
    } catch { return new Set(); }
  };
  const dismissedRef = useRef<Set<string>>(loadDismissed());
  const persistDismissed = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(dismissedRef.current).slice(-500)));
    } catch {}
  };
  const [secondsLeft, setSecondsLeft] = useState(0);
  const shownAtRef = useRef<number>(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const standbyRef = useRef(standby);
  standbyRef.current = standby;

  const stopAlerts = useCallback(() => {
    if (soundTimerRef.current) {
      clearInterval(soundTimerRef.current);
      soundTimerRef.current = null;
    }
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setSecondsLeft(0);
  }, []);

  const close = useCallback(() => {
    stopAlerts();
    setDelivery(null);
    setState("empty");
  }, [stopAlerts]);

  const startAlerts = useCallback(() => {
    try {
      playUrgentNotification();
      if ("vibrate" in navigator) navigator.vibrate?.([400, 200, 400, 200, 400]);
    } catch {}
    soundTimerRef.current = setInterval(() => {
      try {
        playUrgentNotification();
        if ("vibrate" in navigator) navigator.vibrate?.([400, 200, 400]);
      } catch {}
    }, 4000);

    // Local response countdown (UI only — no database polling).
    shownAtRef.current = Date.now();
    setSecondsLeft(Math.ceil(timeoutMs / 1000));
    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, timeoutMs - (Date.now() - shownAtRef.current));
      setSecondsLeft(Math.ceil(remaining / 1000));
    }, 1000);

    autoCloseRef.current = setTimeout(() => {
      console.log("[DeliveryOverlay] Sem resposta em", timeoutMs, "ms — oferta segue disponível para outros motoristas");
      close();
    }, timeoutMs);
  }, [close, timeoutMs]);

  const loadDelivery = useCallback(
    async (id: string) => {
      setState("loading");
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("id, pickup_address, delivery_address, driver_fee, credit_cost, status, driver_id, restaurants(name, address)")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        console.log("[DeliveryOverlay] Erro ao carregar entrega", error);
        setState("error");
        return;
      }
      if ((data as any).status !== "pending") {
        toast.info("Esta entrega já foi aceita por outro motorista.");
        close();
        return;
      }
      if ((data as any).driver_id && (data as any).driver_id !== user?.id) {
        toast.info("Esta entrega já foi aceita por outro motorista.");
        close();
        return;
      }

      const next: OverlayDelivery = {
        id: (data as any).id,
        pickup_address: (data as any).pickup_address,
        delivery_address: (data as any).delivery_address,
        driver_fee: (data as any).driver_fee,
        credit_cost: (data as any).credit_cost,
        restaurant: (data as any).restaurants,
      };
      setDelivery(next);
      setState("success");
    },
    [close, user?.id]
  );

  /** Opens the overlay for a specific delivery (used by push deep links). */
  const openDelivery = useCallback(
    (id: string) => {
      if (!id) return;
      if (dismissedRef.current.has(id)) dismissedRef.current.delete(id);
      stopAlerts();
      startAlerts();
      loadDelivery(id);
    },
    [loadDelivery, startAlerts, stopAlerts]
  );

  // Deep link (?entrega=<id>) coming from a push notification click, plus
  // messages posted by the service worker when reusing an existing window.
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const consumeParam = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("entrega");
      if (!id) return;
      params.delete("entrega");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
      console.log("[DeliveryOverlay] Deep link de push recebido", id);
      openDelivery(id);
    };
    consumeParam();

    const handleUnavailable = (pedidoId?: string | null) => {
      setDelivery((current) => {
        if (!current) return current;
        if (pedidoId && current.id !== pedidoId) return current;
        stopAlerts();
        setState("empty");
        toast.info("Esta entrega já foi aceita por outro motorista.");
        return null;
      });
    };

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "OPEN_DELIVERY" && event.data?.requestId) {
        console.log("[DeliveryOverlay] Clique na notificação (SW)", event.data.requestId);
        openDelivery(event.data.requestId);
      }
      if (event.data?.type === "DELIVERY_UNAVAILABLE") {
        console.log("[DeliveryOverlay] Entrega indisponível (SW)", event.data.requestId);
        handleUnavailable(event.data.requestId);
      }
    };
    const onUnavailable = (event: Event) => {
      handleUnavailable((event as CustomEvent).detail?.pedidoId);
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    window.addEventListener("delivery-unavailable", onUnavailable as EventListener);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      window.removeEventListener("delivery-unavailable", onUnavailable as EventListener);
    };
  }, [user, openDelivery, stopAlerts]);


  // Notification / overlay permission check (web fallback for Android SYSTEM_ALERT_WINDOW).
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermissionWarning(true);
      return "denied" as NotificationPermission;
    }
    try {
      const result = await Notification.requestPermission();
      setPermissionWarning(result !== "granted");
      return result;
    } catch {
      setPermissionWarning(true);
      return "denied" as NotificationPermission;
    }
  }, []);

  // Realtime listener for new pending deliveries.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("delivery-overlay")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "delivery_requests" },
        (payload: any) => {
          const row = payload.new;
          if (!row || row.status !== "pending") return;
          if (row.driver_id && row.driver_id !== user.id) return;
          if (dismissedRef.current.has(row.id)) return;
          if (!standbyRef.current) return; // only when driver is standby/online
          if (delivery) return; // prevent multiple overlays

          console.log("[DeliveryOverlay] Nova entrega recebida", row.id);
          startAlerts();
          loadDelivery(row.id);

          // Show OS-level notification so the driver is alerted even when the
          // tab is in background, screen is off, or another app is focused.
          void (async () => {
            try {
              if (
                typeof window !== "undefined" &&
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                const { data: cfg } = await supabase.from("delivery_config").select("app_fee_per_delivery").limit(1).maybeSingle();
                const appFeePct = Number((cfg as any)?.app_fee_per_delivery ?? 2);
                const grossFee = Number(row.driver_fee ?? 0);
                const netFee = Math.max(0, grossFee * (1 - appFeePct / 100));

                const n = new Notification("🚨 Nova entrega disponível!", {
                  body: `Ganho Líquido: R$ ${netFee.toFixed(2)} · Toque para aceitar`,
                  tag: `delivery-${row.id}`,
                  requireInteraction: true,
                  icon: "/icon-192.png",
                  badge: "/icon-192.png",
                } as NotificationOptions);
                n.onclick = () => {
                  window.focus();
                  n.close();
                };
              }
            } catch (e) {
              console.log("[DeliveryOverlay] Falha ao exibir notificação OS", e);
            }
          })();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "delivery_requests" },
        (payload: any) => {
          // If the currently-shown delivery was taken or cancelled, dismiss.
          const row = payload.new;
          if (!row || !delivery) return;
          if (row.id !== delivery.id) return;
          if (row.status !== "pending" || (row.driver_id && row.driver_id !== user.id)) {
            close();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, delivery, startAlerts, loadDelivery, close]);

  // Cleanup on unmount.
  useEffect(() => () => stopAlerts(), [stopAlerts]);

  const accept = useCallback(async () => {
    if (!delivery || !user) return;
    try {
      const { error } = await (supabase as any).rpc("accept_delivery_request", {
        p_request_id: delivery.id,
      });
      if (error) throw error;




      console.log("[Delivery] Motorista aceitou (overlay)", {
        request_id: delivery.id,
        driver_user_id: user.id,
        response_time_ms: shownAtRef.current ? Date.now() - shownAtRef.current : null,
        at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
      onAccepted?.(delivery);
      close();
    } catch (err: any) {
      console.log("[DeliveryOverlay] Falha ao aceitar", err);
      const msg = String(err?.message ?? "");
      if (/já foi assumida|já foi aceita|direcionada/i.test(msg)) {
        toast.info("Esta entrega já foi aceita por outro motorista.");
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        close();
        return;
      }
      setState("error");

    }
  }, [delivery, user, queryClient, onAccepted, close]);

  const reject = useCallback(() => {
    if (!delivery) return;
    console.log("[DeliveryOverlay] Entrega recusada", {
      request_id: delivery.id,
      response_time_ms: shownAtRef.current ? Date.now() - shownAtRef.current : null,
      at: new Date().toISOString(),
    });
    dismissedRef.current.add(delivery.id);
    persistDismissed();
    close();
  }, [delivery, close]);

  return {
    delivery,
    state,
    secondsLeft,
    accept,
    reject,
    close,
    openDelivery,
    permissionWarning,
    requestPermission,
  };
}
