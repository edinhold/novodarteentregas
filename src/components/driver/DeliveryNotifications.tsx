import { useEffect, useRef } from "react";
import DeliveryOverlay from "./DeliveryOverlay";
import { useDeliveryOverlay } from "@/hooks/useDeliveryOverlay";

interface Props {
  /** True when the driver is in standby (online + no active delivery). */
  standby: boolean;
  /** Callback invoked after the driver accepts; used to navigate to details. */
  onAccepted?: () => void;
  timeoutMs?: number;
}

/**
 * Mountable wrapper that shows the standby delivery overlay above the
 * entire app whenever a new pending delivery arrives.
 */
const DeliveryNotifications = ({ standby, onAccepted, timeoutMs }: Props) => {
  const { delivery, state, secondsLeft, accept, reject, permissionWarning, requestPermission } = useDeliveryOverlay({
    standby,
    timeoutMs,
    onAccepted: () => onAccepted?.(),
  });

  // Keep the screen awake while the driver is in standby so OS notifications
  // and the in-app overlay fire reliably even when the phone would otherwise
  // sleep. Released automatically when standby turns off or tab is hidden.
  const wakeLockRef = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      try {
        if (!standby) return;
        if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
        const lock = await (navigator as any).wakeLock.request("screen");
        if (cancelled) {
          try { await lock.release(); } catch {}
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener?.("release", () => {
          wakeLockRef.current = null;
        });
      } catch (e) {
        console.log("[DeliveryNotifications] WakeLock indisponível", e);
      }
    };
    const release = async () => {
      try { await wakeLockRef.current?.release?.(); } catch {}
      wakeLockRef.current = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && standby && !wakeLockRef.current) {
        acquire();
      }
    };
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [standby]);

  const handleRequestPermission = async () => {
    const { toast } = await import("sonner");
    const result = await requestPermission();
    if (result === "granted") {
      toast.success("Notificações ativadas neste dispositivo.");
    } else if (result === "denied") {
      toast.warning(
        "Permissão bloqueada. Habilite notificações nas configurações do navegador/app."
      );
    } else {
      toast.info("Permissão não concedida. Toque em Conceder para tentar novamente.");
    }
  };

  return (
    <DeliveryOverlay
      delivery={delivery}
      state={state}
      secondsLeft={secondsLeft}
      permissionWarning={permissionWarning}
      onAccept={accept}
      onReject={reject}
      onRequestPermission={handleRequestPermission}
    />
  );
};

export default DeliveryNotifications;
