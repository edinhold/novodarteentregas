import { useCallback, useEffect, useState } from "react";
import { enablePush, initPush, syncCurrentSubscription, type PushState } from "@/lib/push";

export function usePushNotifications(userId?: string | null, profileType = "driver") {
  const [state, setState] = useState<PushState | null>(null);
  const [loading, setLoading] = useState(false);

  // Validação e sincronização automática de dispositivos
  const sync = useCallback(async () => {
    if (!userId) return null;
    try {
      await initPush();
      const s = await syncCurrentSubscription(userId, profileType);
      setState(s);
      return s;
    } catch (e) {
      console.warn("[usePushNotifications] Erro na sincronização automática:", e);
      return null;
    }
  }, [userId, profileType]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    // 1. Sincronização inicial
    sync();

    // 2. Validação automática quando o motorista volta ao app (foco de janela)
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        sync();
      }
    };
    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    // 3. Heartbeat periódico a cada 3 minutos para manter a assinatura ativa e last_seen_at atualizado
    const interval = setInterval(() => {
      if (!cancelled) sync();
    }, 3 * 60 * 1000);

    return () => {
      cancelled = true;
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      clearInterval(interval);
    };
  }, [userId, profileType, sync]);

  const activate = useCallback(async () => {
    if (!userId) return null;
    setLoading(true);
    try {
      const s = await enablePush(userId, profileType);
      setState(s);
      return s;
    } finally {
      setLoading(false);
    }
  }, [userId, profileType]);

  return { state, loading, activate, sync };
}
